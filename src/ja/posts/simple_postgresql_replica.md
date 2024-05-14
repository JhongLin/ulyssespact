---
title: 簡単な PostgreSQL のレプリケーションを試してみた
description: PostgreSQL のインストールと操作を行い、そして新しい Master DB への Slave DB のスムーズな転換方法
date: 2024-05-14
tags:
    - ja_posts
    - database
    - postgresql
    - docker
    - replica
---

## 背景

&emsp;&emsp;
以前の仕事でこんな状況に遭遇したことがあります。プロジェクトがオンラインでサービスを提供しているときにデータベースが壊れてしまい、Slave DB を Master DB の代わりに使ってサービスを続ける必要がありました。そして、ホームサーバーを設置してからは、DB を作成する必要が出てきました。これを機にデータベースのマスタースレーブレプリケーション（以下、本文ではレプリカと呼びます）を試すことができました。今回選んだデータベース管理システムは PostgreSQL で、主に多くのオープンソースプロジェクトが PostgreSQL をプロジェクトで使用するデータベースとしているため、これを機に触ってみることにしました。

&emsp;&emsp;
最近はホームサーバー内のすべてのサービスをコンテナ化しているので、今回レプリカのシナリオを実装するためにも docker を選択しました。最初は [bitnami](https://hub.docker.com/r/bitnami/postgresql) のイメージを使って実装していましたが、理解できない設定が多すぎて目標を達成できなかったため、最終的には自分でイメージを改造することにしました。

## レプリカの検証ステップ

1. Master DB に書き込みまたは削除を行うと、他の Slave DB も同じ内容を保持します。
2. Slave DB は書き込み不可の状態を保ちます。
3. 途中で新たに Slave DB のコンテナを追加し、データが一致しているか確認します。
4. Master DB を切断し、一つの Slave DB を Master DB に変更します。他の Slave DB は新な Master DB からデータを更新できますこと。
5. ステップ1 - 2を繰り返します。

## 過程

### docker compose と dockerfile

- 使われた `docker-compose.yml` の內容

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

#### 説明

- `docker-compose.yml` はかなりシンプルで，container はすべて `tail -f /usr/src/watch` を使用して稼働状態を維持します。一方、 `postgres-master` は DB を起動するコマンドが一個追加されています。これは初期化動作を持つイメージからの原因です。
- 続いて Dockerfile を見てみましょう。まず、共通のフェーズについて説明します：
    - `Phase 1` Debian 12 をベースイメージとして使用します
    - `Phase 2` PostgreSQL のソースを apt-key に追加し、`apt` を使用して `postgresql-16` をインストールします
    - `Phase 3` `/opt/postgresql` を PostgreSQL のインストールパスとして設定し、正しいアクセス権限を設定します
    - `Final phase` コンテナのエントリーポイントを上記のパスに設定します
- 次に、`Dockerfile.master.postgres` の初期化動作 `Phase 4` について説明します:
    - `initdb -k -D /opt/postgresql`
        - `initdb` コマンドを使用して PostgreSQL データを作成します
        - [`-k`](https://www.postgresql.org/docs/current/app-initdb.html#APP-INITDB-DATA-CHECKSUMS) は checksums を使用してデータページが破損していないかを検出します
        - [`-D`](https://www.postgresql.org/docs/current/app-initdb.html#APP-INITDB-OPTION-PGDATA) はインストールパスを確認します
    - `sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /opt/postgresql/postgresql.conf`
        - `listen_addresses` パラメータを `'*'` に変更して、すべてのリクエストを受け入れます
    - `sed -i "s/#port = 5432/port = 5432/" /opt/postgresql/postgresql.conf`
        - 起動ポートを 5432 に設定します
    - `echo "host    all             postgres        0.0.0.0/0               trust" >> /opt/postgresql/pg_hba.conf`
        - ユーザー `postgres` が外部からアクセスするときに制限されないように設定します
    - `echo "host    replication     replica         0.0.0.0/0               trust" >> /opt/postgresql/pg_hba.conf`
        - ユーザー `replica` が `replication` 操作を行うときに制限されないように設定します

### ターミナルの操作コマンド

- `docker compose up -d` でコンテナを起動します
- Master DB に `replica` というユーザーをレプリカのロールとして添います
    - `psql -h 127.0.0.1 -p 8000 -U postgres -c "CREATE USER replica Replication"`
    - ユーザー一覧
        - `psql -h 127.0.0.1 -p 8000 -U postgres -c "\du"`

| Role name | Attributes                                                 |
| --------- | ---------------------------------------------------------- |
| postgres  | Superuser, Create role, Create DB, Replication, Bypass RLS |
| replica   | Replication                                                |

- まだ Master DB と Slave DB のマスタースレーブ関係が設定されていないので、まずは Slave DB のコンテナに入って設定を行います：
    - Slave DB のコンテナに入っています
        - `docker compose exec postgres-slave-1 bash`
    - `postgres-master` のコンテナ中の PostgreSQL からレプリカを行います
        - `pg_basebackup -h postgres-master -U replica -D /opt/postgresql -P -v -R -C -S slave_slot`
            - [`pg_basebackup`](https://www.postgresql.org/docs/current/app-pgbasebackup.html) を使ってレプリカを行います
            - `-h postgres-master` レプリカソースの host は postgres-master
            - `-U replica` ユーザー replica としてログインします
            - `-D /opt/postgresql` バックアップデータを（Slave DBのコンテナの）どこに保存するか
            - `-P` 現在のレプリカの進行状況を常にターミナルに返します
            - `-v` レプリカサービスの起動と停止時に処理メッセージを表示
            - `-R` レプリカを自動設定
            - `-C -S slave_slot` slave_slot という名のレプリカ slot を作成し使用します
                - ※注意：この Slot は Master DB の上に作成されます。
    - Slave DB を起動
        - `pg_ctl start -D .`
    - Slave DB のコンテナから離脱
        - `exit`

- Master DB にあるデータベース一覧
    - `psql -h 127.0.0.1 -p 8000 -U postgres -c "\l"`

| Name      | Owner    | Encoding  | Locale Provider | Collate | Ctype | ICU Locale | ICU Rules | Access privileges      |
| --------- | -------- | --------- | --------------- | ------- | ----- | ---------- | --------- | ---------------------- |
| postgres  | postgres | SQL_ASCII | libc            | C       | C     |            |           |                        |
| template0 | postgres | SQL_ASCII | libc            | C       | C     |            |           | =c/postgres          + |
|           |          |           |                 |         |       |            |           | postgres=CTc/postgres  |
| template1 | postgres | SQL_ASCII | libc            | C       | C     |            |           | =c/postgres          + |
|           |          |           |                 |         |       |            |           | postgres=CTc/postgres  |

デフォルトの `postgres` データベースと、二つのテンプレートデータベース `template0` と `template1` が見えます。

- 新しいデータベース `test` を作成します
    - `psql -h 127.0.0.1 -p 8000 -U postgres -c "CREATE DATABASE test;"`
    - `psql -h 127.0.0.1 -p 8000 -U postgres -c "\l"` を再入力して確認します

| Name      | Owner    | Encoding  | Locale Provider | Collate | Ctype | ICU Locale | ICU Rules | Access privileges      |
| --------- | -------- | --------- | --------------- | ------- | ----- | ---------- | --------- | ---------------------- |
| postgres  | postgres | SQL_ASCII | libc            | C       | C     |            |           |                        |
| template0 | postgres | SQL_ASCII | libc            | C       | C     |            |           | =c/postgres          + |
|           |          |           |                 |         |       |            |           | postgres=CTc/postgres  |
| template1 | postgres | SQL_ASCII | libc            | C       | C     |            |           | =c/postgres          + |
|           |          |           |                 |         |       |            |           | postgres=CTc/postgres  |
| test      | postgres | SQL_ASCII | libc            | C       | C     |            |           |                        |

&emsp;&emsp;`test` が追加されたのを見えます。

- `psql` のセッションに入って `test` データベースを使います
    - `psql -h 127.0.0.1 -p 8000 -U postgres -d test`
- 新な TABLE `client` を作ります。`id`、`name`、`email` 三つの属性があります

```sql
CREATE TABLE client (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE
);
```

- `\dt` で TABLE 一覧を確認します

| Schema | Name        | Type     | Owner    |
| ------ | ----------- | -------- | -------- |
| public | client      | table    | postgres |

&emsp;&emsp;さっき作り上げた `client` のを見えます。

- 3 本の資料を `client` TABLE に追加します

```sql
INSERT INTO client (id, name, email)
VALUES 
(1, 'John Doe', 'johndoe@example.com'),
(2, 'Jane Smith', 'janesmith@example.com'),
(3, 'Bob Johnson', 'bobjohnson@example.com');
```

- 追加された資料の確認をします
    - `SELECT * FROM client";`

<!-- markdownlint-disable MD034 -->
| id  | name        | email                  |
| --- | ----------- | ---------------------- |
| 1   | John Doe    | johndoe@example.com    |
| 2   | Jane Smith  | janesmith@example.com  |
| 3   | Bob Johnson | bobjohnson@example.com |

- 今度は Slave DB の操作に切り替えます
    - `\q` を入力して現在の `psql` セッションを終了します
    - 次に `psql -h 127.0.0.1 -p 8001 -d test -U postgres` を入力して Slave DB に入ります
- データが一致しているか確認します
    - `SELECT * FROM "client";`

- 今度はデータを変更できるか試してみましょう
    - `UPDATE client SET email='johndoe@sample.com' WHERE name='John Doe';`

```bash
ERROR:  cannot execute UPDATE in a read-only transaction
```

&emsp;&emsp;したがって、現在の Slave DB のデータは確かに変更できません。

- それでは、Master DB で削除コマンドを実行し、再度 Slave DB に戻って状況を確認します
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

&emsp;&emsp;確かに Slave DB は Master DB のデータ変更に追従していることが確認できます。

- もう一つの Slave DB 2 のコンテナを起動してみましょう：
    - `docker-compose.yml` に以下の内容を追加します

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

- 同じく、まず Slave DB 2 のコンテナに入って設定を行う必要があります：
    - Slave DB 2 のコンテナに入ります
        - `docker compose exec postgres-slave-2 bash`
    - `postgres-slave-1` コンテナ中の PostgreSQL からレプリカを行います
        - `pg_basebackup -h postgres-slave-1 -U replica -D /opt/postgresql -P -v -R -C -S slave_slot`
            - ※注意：ここでは `postgres-slave-1` を使用してレプリカを行います。
    - Slave DB 2 を起動します
        - `pg_ctl start -D .`
    - 退出 Slave DB 2 のコンテナから退出
        - `exit`

- なぜ `postgres-slave-1` から `postgres-slave-2` をバックアップするのでしょうか？
    - Slave DB を Master DB にスムーズに切り替えることができます
    - [公式ドキュメント](https://docs.postgresql.tw/reference/client-applications/pg_basebackup) の推奨に従って、Master DBの負荷を軽減します

> There can be multiple pg_basebackups running at the same time, but it is usually better from a performance point of view to take only one backup, and copy the result.

&emsp;&emsp;これは実際に私が最も時間を費やして出した結論です。一般的に「1 つの Master DB、2 つの Slave DB」と言われると、最も直感的な可能性は：

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/master_backups_slaves_directly_2.gif" alt="master_backups_slaves_directly">
</p>
<p align="center">
    ▲ Master DB backups 2 Slave DB directly
</p>

&emsp;&emsp;しかし、Slave DB から Master DB に切り替える試みの中で、このような構造だと移行に問題が生じることがわかりました：

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/switch_master_1.gif" alt="master_switch_problem">
</p>
<p align="center">
    ▲ Cannot switch to new Master DB smoothly
</p>

&emsp;&emsp;それは、PostgreSQL の WAL にはチェックポイントのメカニズムがあり、Slave DB 2 が新しいバックアップソースに切り替える必要があるとき、チェックポイントの不一致を検出し、それが切り替えの失敗につながります。

&emsp;&emsp;そのため、最終的な形状は以下の図のようになります：

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/switch_master_2.gif" alt="master_backups_slaves_seperately">
</p>
<p align="center">
    ▲ Master DB backup 2 Slave DB seperately
</p>

- またたび Slave DB 2 に移動して、データが上記と一致しているか確認します：
    - `psql -h 127.0.0.1 -p 8002 -U postgres -d test`
    - `SELECT * FROM "client";`
    - `\q`

- 次に、Master DB が接続できない状況をシミュレートします
    - Master のコンテナを閉じます
        - `docker compose stop postgres-master`
    - Slave DB 1 を新しい Master DB として設定します
        - `docker compose exec postgres-slave-1 /usr/lib/postgresql/16/bin/pg_ctl promote -D /opt/postgresql`
    - 新しい Master DB のデータを変更します
        - `psql -h 127.0.0.1 -p 8001 -U postgres -d test`
        - `UPDATE client SET email='johndoe@sample.com' WHERE name='Jane Smith';`
        - `\q`
    - では、Slave DB 2 のデータが更新されたかどうかを確認します
        - `psql -h 127.0.0.1 -p 8002 -U postgres -d test`
        - `SELECT * FROM client;`

| id  | name        | email                  |
| --- | ----------- | ---------------------- |
| 3   | Bob Johnson | bobjohnson@example.com |
| 2   | Jane Smith  | johndoe@sample.com     |

&emsp;&emsp;データが変更されたことが確認できます！

- 最後に、Slave DB 2 に書き込むことができるかどうかをテストします：
    - `UPDATE client SET email='bobjohnson@sample.com' WHERE name='Bob Johnson';`

```bash
ERROR:  cannot execute UPDATE in a read-only transaction
```

これで、レプリカの検証プロセスが成功したことを宣言できます！

## 後日談、というか、今回のオチ

実際、[bitnami](https://hub.docker.com/r/bitnami/postgresql) を使って実装を始めたときは非常に順調しましたが、最後に Master DB を切り替えるときに多くの問題に遭遇しました。特に、[その説明](https://github.com/bitnami/containers/blob/main/bitnami/postgresql/README.md) と実際の PostgreSQL 16 との互換性がないことが問題でした…。自分でイメージを作る過程も非常に時間がかかり、途中で Master DB の切り替えの問題に再び遭遇しました。PostgreSQL は元々このようなことを推奨していないようで、最終的に Master DB -> Slave DB 1 -> Slave DB 2 の方法を知ることになりました。幸い、最終的には目標を達成することができ、多くのことを学ぶことができました。
