---
title: 實作 PostgreSQL 簡單的主從複製 (Replica) 及 Master DB 切換
description: 包含部署以及操作 PostgreSql，以及使用 Slave DB 替換 Master DB
date: 2024-05-14
tags:
    - zh_posts
    - database
    - postgresql
    - docker
    - replica
---

## 背景

&emsp;&emsp;
以前在工作上曾經遇到過這麼一個狀況，專案在線上提供服務的時候資料庫壞了，需要使用 Slave DB 來替換 Master DB 來繼續提供服務，而自從架設了 home server 之後，也遇到了需要建立 DB 的需求，剛好可以趁這個機會來實作資料庫的主從複製 (本文由此往後都稱 Replica)。這次選用的資料庫管理系統是 PostgreSQL，主要是因為許多開源專案都是使用 PostgreSQL 作為專案使用的資料庫，剛好趁這個機會摸一下。

&emsp;&emsp;
最近在替 home server 中所有的服務都 container 化，所以也選擇使用 docker 來實作這次的情境。  原本是使用 [bitnami](https://hub.docker.com/r/bitnami/postgresql) 的 image 來實作，但因為不了解的設定太多，無法達到預計的目標，最後決定由自己來改 image。

## Replica 的驗證程序

1. 寫入或刪除 Master DB 的同時，其他 Slave DB 也都會保持一樣的內容。
2. Slave DB 保持不可寫入的狀態
3. 途中新增一個 Slave DB 的 container 確認資料是否也一致。
4. 斷開 Master DB，讓其中一個 Slave DB 變為 Master DB，其他 Slave DB 需要從 Master 上來更新資料。
5. 重複步驟 1 - 2。

## 過程

### docker compose 與 dockerfile

- 使用的 `docker-compose.yml` 內容

```yaml
services:
  postgres-master:
    build:
      context: .
      dockerfile: Dockerfile.master.postgres
    restart: unless-stopped
    ports:
      - "8000:5432"
    command: "bash -c '/usr/lib/postgresql/16/bin/pg_ctl start -D /opt/postgresql && tail -f /usr/src/watch'"

  postgres-slave-1:
    build:
      context: .
      dockerfile: Dockerfile.slave.postgres
    restart: unless-stopped
    depends_on:
      - postgres-master
    ports:
      - "8001:5432"
    command: "bash -c 'tail -f /usr/src/watch'"
```

- `Dockerfile.master.postgres`

```dockerfile
# Phase 1: Build the image from Debian 12
FROM debian:bookworm-20240423

# Phase 2: Install `postgresql-16` by `apt` package manager tool
RUN apt update -y && apt upgrade -y && apt install -y curl ca-certificates
RUN install -d /usr/share/postgresql-common/pgdg
RUN curl -s -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
RUN echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list
RUN apt update -y && apt install -y postgresql-16

# Phase 3: Prepare `/opt` for the working directory by root
RUN chmod 777 /opt
RUN touch /usr/src/watch

# Phase 3.1: Export the path of `pg_*` tools and configure the right privilege for running PostgreSQL
USER postgres
RUN echo 'export PATH=$PATH:/usr/lib/postgresql/16/bin' >> /var/lib/postgresql/.bashrc
RUN mkdir -m 700 /opt/postgresql

# Phase 4: Modify the configuration for PostgreSQL to be connectable
RUN /usr/lib/postgresql/16/bin/initdb -k -D /opt/postgresql
RUN sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /opt/postgresql/postgresql.conf
RUN sed -i "s/#port = 5432/port = 5432/" /opt/postgresql/postgresql.conf
RUN echo "host    all             postgres        0.0.0.0/0               trust" >> /opt/postgresql/pg_hba.conf
RUN echo "host    replication     replica         0.0.0.0/0               trust" >> /opt/postgresql/pg_hba.conf

# Final phase: set the entry path for `docker compose exec`
WORKDIR /opt/postgresql
```

- `Dockerfile.slave.postgres`

```dockerfile
# Phase 1: Build the image from Debian 12
FROM debian:bookworm-20240423

# Phase 2: Install `postgresql-16` by `apt` package manager tool
RUN apt update -y && apt upgrade -y && apt install -y curl ca-certificates
RUN install -d /usr/share/postgresql-common/pgdg
RUN curl -s -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
RUN echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list
RUN apt update -y && apt install -y postgresql-16

# Phase 3: Prepare `/opt` for the working directory by root
RUN chmod 777 /opt
RUN touch /usr/src/watch

# Phase 3.1: Export the path of `pg_*` tools and configure the right privilege for running PostgreSQL
USER postgres
RUN echo 'export PATH=$PATH:/usr/lib/postgresql/16/bin' >> /var/lib/postgresql/.bashrc
RUN mkdir -m 700 /opt/postgresql

# Final phase: set the entry path for `docker compose exec`
WORKDIR /opt/postgresql
```

#### 解釋

- `docker-compose.yml` 相對簡單，container 都使用 `tail -f /usr/src/watch` 來維持運行狀態，而 `postgres-master` 則是多了一個啟動 DB 的命令，因為它是來自具有初始化動作的 image。
- 接下來看一下 Dockerfile，先解釋一下兩邊共有 Phases
    - `Phase 1` 使用 Debian 12 作為 base image
    - `Phase 2` 加入 PostgreSQL 的 apt-key，並使用 `apt` 安裝 `postgresql-16`
    - `Phase 3` 把 `/opt/postgresql` 作為 PostgreSQL 運作的資料夾，並設定正確的運作權限
    - `Final phase` 將 container 進入點設定為上述資料夾路徑
- 再來解釋 `Dockerfile.master.postgres` 的初始化動作 `Phase 4`:
    - `initdb -k -D /opt/postgresql`
        - 下 `initdb` 指令建立 PostgreSQL 資料
        - [`-k`](https://www.postgresql.org/docs/current/app-initdb.html#APP-INITDB-DATA-CHECKSUMS) 使用 checksums 來偵測 data page 是否毀損
        - [`-D`](https://www.postgresql.org/docs/current/app-initdb.html#APP-INITDB-OPTION-PGDATA) 確認安裝路徑
    - `sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /opt/postgresql/postgresql.conf`
        - 將 `listen_addresses` 參數改為 `'*'` 使之接受所有 request
    - `sed -i "s/#port = 5432/port = 5432/" /opt/postgresql/postgresql.conf`
        - 設定啟動 port 為 5432
    - `echo "host    all             postgres        0.0.0.0/0               trust" >> /opt/postgresql/pg_hba.conf`
        - 設定使用者 `postgres` 從外部訪問將不受限制
    - `echo "host    replication     replica         0.0.0.0/0               trust" >> /opt/postgresql/pg_hba.conf`
        - 設定使用者 `replica` 進行 `replication` 動作時將不受限制

### 終端操作命令

- `docker compose up -d` 啟動 container
- 在 Master DB 中加入名為 `replica` 的使用者來作為備份 Role
    - `psql -h 127.0.0.1 -p 8000 -U postgres -c "CREATE USER replica Replication"`
    - 查看現有 USER
        - `psql -h 127.0.0.1 -p 8000 -U postgres -c "\du"`

| Role name | Attributes                                                 |
| --------- | ---------------------------------------------------------- |
| postgres  | Superuser, Create role, Create DB, Replication, Bypass RLS |
| replica   | Replication                                                |

- 因為還沒設定 Master DB 跟 Slave DB 的主從關係，所以先進入 Slave DB 的 container 進行設定：
    - 進入 Slave DB 的 container
        - `docker compose exec postgres-slave-1 bash`
    - 從 `postgres-master` container 的 PostgreSQL 進行 replica
        - `pg_basebackup -h postgres-master -U replica -D /opt/postgresql -P -v -R -C -S slave_slot`
            - 使用 [`pg_basebackup`](https://www.postgresql.org/docs/current/app-pgbasebackup.html) 工具進行 replica
            - `-h postgres-master` 來源 host 為 `postgres-master`
            - `-U replica` 作為 `replica` 使用者登入
            - `-D /opt/postgresql` 要備份資料到 (Slave DB 的 container 的) 哪一個位置
            - `-P` 會一直回傳目前的 replica 進度
            - `-v` 啟動與關閉 replica 服務皆會顯示處理訊息
            - `-R` 設定 replica
            - `-C -S slave_slot` 建立並使用一個名為 `slave_slot` 的 replica slot
                - ※注意：這個 Slot 是建立在 Master DB 上的。
    - 啟動 Slave DB
        - `pg_ctl start -D .`
    - 退出 Slave DB 的 container
        - `exit`

- 查看目前在 Master DB 有哪些資料庫
    - `psql -h 127.0.0.1 -p 8000 -U postgres -c "\l"`

| Name      | Owner    | Encoding  | Locale Provider | Collate | Ctype | ICU Locale | ICU Rules | Access privileges      |
| --------- | -------- | --------- | --------------- | ------- | ----- | ---------- | --------- | ---------------------- |
| postgres  | postgres | SQL_ASCII | libc            | C       | C     |            |           |                        |
| template0 | postgres | SQL_ASCII | libc            | C       | C     |            |           | =c/postgres          + |
|           |          |           |                 |         |       |            |           | postgres=CTc/postgres  |
| template1 | postgres | SQL_ASCII | libc            | C       | C     |            |           | =c/postgres          + |
|           |          |           |                 |         |       |            |           | postgres=CTc/postgres  |

可以看到預設的 `postgres` 資料庫與兩個模板資料庫 `template0`, `template1`。

- 創建新的資料庫 test
    - `psql -h 127.0.0.1 -p 8000 -U postgres -c "CREATE DATABASE test;"`
    - 再輸入 `psql -h 127.0.0.1 -p 8000 -U postgres -c "\l"` 確認

| Name      | Owner    | Encoding  | Locale Provider | Collate | Ctype | ICU Locale | ICU Rules | Access privileges      |
| --------- | -------- | --------- | --------------- | ------- | ----- | ---------- | --------- | ---------------------- |
| postgres  | postgres | SQL_ASCII | libc            | C       | C     |            |           |                        |
| template0 | postgres | SQL_ASCII | libc            | C       | C     |            |           | =c/postgres          + |
|           |          |           |                 |         |       |            |           | postgres=CTc/postgres  |
| template1 | postgres | SQL_ASCII | libc            | C       | C     |            |           | =c/postgres          + |
|           |          |           |                 |         |       |            |           | postgres=CTc/postgres  |
| test      | postgres | SQL_ASCII | libc            | C       | C     |            |           |                        |

&emsp;&emsp;可以看到多了一個資料庫 `test`。

- 進入 `psql` 並切換至使用 `test` 資料庫
    - `psql -h 127.0.0.1 -p 8000 -U postgres -d test`
- 創建新 TABLE `client` 帶有 `id`, `name`, 跟 `email` 三個欄位

```sql
CREATE TABLE client (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE
);
```

- 輸入 `\dt` 確認目前資料表

| Schema | Name        | Type     | Owner    |
| ------ | ----------- | -------- | -------- |
| public | client      | table    | postgres |

&emsp;&emsp;可以看到剛剛新建的 `client` 表。

- 加入 3 筆資料到 `client` 表中

```sql
INSERT INTO client (id, name, email)
VALUES 
(1, 'John Doe', 'johndoe@example.com'),
(2, 'Jane Smith', 'janesmith@example.com'),
(3, 'Bob Johnson', 'bobjohnson@example.com');
```

- 看一下剛剛加入的資料
    - `SELECT * FROM client";`

<!-- markdownlint-disable MD034 -->
| id  | name        | email                  |
| --- | ----------- | ---------------------- |
| 1   | John Doe    | johndoe@example.com    |
| 2   | Jane Smith  | janesmith@example.com  |
| 3   | Bob Johnson | bobjohnson@example.com |

- 現在換作操作 Slave DB
    - 下 `\q` 離開目前的 `psql` session
    - 再下 `psql -h 127.0.0.1 -p 8001 -d test -U postgres` 進入 Slave DB
- 查看是否資料一致
    - `SELECT * FROM "client";`

- 現在試試看可否修改資料
    - `UPDATE client SET email='johndoe@sample.com' WHERE name='John Doe';`

```bash
ERROR:  cannot execute UPDATE in a read-only transaction
```

&emsp;&emsp;所以目前的 Slave 資料庫確實不能修改。

- 那我們去 Master 下刪除指令，再回到 Slave 看一下情況。
    - `\q`
    - `psql -h 127.0.0.1 -p 8000 -U postgres -d test`
    - `\c test`
    - `DELETE FROM client WHERE name='John Doe';`
    - `\q`
    - `psql -h 127.0.0.1 -p 8001 -U postgres -d test`
    - `SELECT * FROM "client";`

| id  | name        | email                  |
| --- | ----------- | ---------------------- |
| 2   | Jane Smith  | janesmith@example.com  |
| 3   | Bob Johnson | bobjohnson@example.com |

&emsp;&emsp;可以看到確實 Slave 確實有跟著 Master 的資料變更。

- 試試看多啟動一個 Slave DB 2 的 container：
    - 在 `docker-compose.yml` 中加入以下內容

```yaml
  postgres-slave-2:
    build:
      context: .
      dockerfile: Dockerfile.slave.postgres
    restart: unless-stopped
    depends_on:
      - postgres-master
    ports:
      - "8002:5432"
    command: "bash -c 'tail -f /usr/src/watch'"
```

- 同樣的，需要先進入 Slave DB 2 的 container 進行設定：
    - 進入 Slave DB 的 container
        - `docker compose exec postgres-slave-2 bash`
    - 從 `postgres-slave-1` container 的 PostgreSQL 進行 replica
        - `pg_basebackup -h postgres-slave-1 -U replica -D /opt/postgresql -P -v -R -C -S slave_slot`
            - ※注意：這邊是使用 `postgres-slave-1` 來進行 replica。
    - 啟動 Slave DB
        - `pg_ctl start -D .`
    - 退出 Slave DB 的 container
        - `exit`

- 為什麼要從 `postgres-slave-1` 來備份 `postgres-slave-2`？
    - 可以順利地切換 Slave DB 到 Master DB
    - 根據[官方文件](https://docs.postgresql.tw/reference/client-applications/pg_basebackup)的建議，降低 Master DB 的負擔

> There can be multiple pg_basebackups running at the same time, but it is usually better from a performance point of view to take only one backup, and copy the result.

&emsp;&emsp;這其實是花了我最多時間的地方得出來的結論。一般如果提到「一個 Master DB，兩個 Slave DB」，最直覺的可能會是：

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/master_backups_slaves_directly_2.gif" alt="master_backups_slaves_directly">
</p>
<p align="center">
    ▲ Master DB backups 2 Slave DB directly
</p>

&emsp;&emsp;但是在嘗試從 Slave DB 切換至 Master DB 的過程中，發現如果是這樣子的架構會遇到轉移上的問題：

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/switch_master_1.gif" alt="master_switch_problem">
</p>
<p align="center">
    ▲ Cannot switch to new Master DB smoothly
</p>

&emsp;&emsp;因為 PostgreSQL 的 WAL 中有個 checkpoint 的機制，當 Slave DB 2 需要切換新的備份來源時，也會檢查得到 checkpoint 不一致，進而導致切換失敗，而且這樣所需要的處理也繁雜不直觀。

&emsp;&emsp;所以最後的樣貌會如下圖：

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/switch_master_2.gif" alt="master_backups_slaves_seperately">
</p>
<p align="center">
    ▲ Master DB backup 2 Slave DB seperately
</p>

- 再去 Slave DB 2 確認資料是否與上述一致：
    - `psql -h 127.0.0.1 -p 8002 -U postgres -d test`
    - `SELECT * FROM "client";`
    - `\q`

- 接下來模擬 Master DB 無法連線的情況
    - 關閉 Master 的 container
        - `docker compose stop postgres-master`
    - 把 Slave DB 1 作為一個新的 Master
        - `docker compose exec postgres-slave-1 /usr/lib/postgresql/16/bin/pg_ctl promote -D /opt/postgresql`
    - 修改新的 Master 中的資料
        - `psql -h 127.0.0.1 -p 8001 -U postgres -d test`
        - `UPDATE client SET email='johndoe@sample.com' WHERE name='Jane Smith';`
        - `\q`
    - 接下來看一下 Slave DB 2 資料是否有被更新
        - `psql -h 127.0.0.1 -p 8002 -U postgres -d test`
        - `SELECT * FROM client;`

| id  | name        | email                  |
| --- | ----------- | ---------------------- |
| 3   | Bob Johnson | bobjohnson@example.com |
| 2   | Jane Smith  | johndoe@sample.com     |

&emsp;&emsp;可以看到資料被更改了！

- 最後測試一下 Slave DB 2 是否可以寫入：
    - `UPDATE client SET email='bobjohnson@sample.com' WHERE name='Bob Johnson';`

```bash
ERROR:  cannot execute UPDATE in a read-only transaction
```

到此終於可以宣告 Replica 的驗證程序成功！

## 後日談

其實使用　[bitnami](https://hub.docker.com/r/bitnami/postgresql) 來實作的時候一開始都非常順利，但是到最後切換 Master DB 的時候就遇到很多問題，特別是 [它的描述](https://github.com/bitnami/containers/blob/main/bitnami/postgresql/README.md) 跟實際上的 PostgreSQL 16 又不相容...。  自己弄 image 的過程又非常花時間，途中依然遇到了切換 Master DB 的問題，PostgreSQL 貌似原本就不建議這樣做，所以最後才會知道 Master DB -> Slave DB 1 -> Slave DB 2 的方式，還好最後的最後有達到預期目標，算是學到了不少東西。
