# Directus SQLite Performance hook-extension

Welcome to the Directus SQLite Performance hook-extension! This extension is
designed to make your Directus SQLite database more efficient and faster. It
achieves this by tuning various performance parameters. This document will guide
you through what each of these performance tunings means and how you can install
and use them effectively.

- [Installation](#installation)
	- [NPM, Docker and Docker Compose](#npm-docker-and-docker-compose)
	- [Marketplace (not advised)](#marketplace-not-advised)
- [Configuration](#configuration)
	- [Journal Mode](#Journal-Mode)
	- [Synchronous Commit](#Synchronous-Commit)
	- [Temporary files location](#Temporary-files-location)
	- [Enable memory mapping](#Enable-memory-mapping)
	- [Increase the page size](#Increase-the-page-size)
- [Conclusion and Contributions](#conclusion-and-contributions)

Remember: all commands executed by this extension will be done for every
connection made to the database. This is default behaviour for SQLite databases.

## Installation

You can either use the marketplace or npm to install this extension. Please read
the [Marketplace](#marketplace-not-advised) section below on how to get the
extension to
show up.

### NPM, Docker and Docker Compose

The preferred way to install this extension is via a package manager. Assuming a
docker or even docker-compose setup, the way to go is to create a custom build
of the official Directus Docker image and install the extension in it.

When using `npm`, this extension can be installed like this:

```sh
npm install directus-hook-sqlite-perf
```

To install the extension in your custom image you need a Dockerfile that
installs the extension via pnpm. This is well documented in the official
directus documentation.

```dockerfile
FROM directus/directus:10.13.1
LABEL authors="Some Name <someone@someone.com>"

USER root

RUN <<EOF
  corepack enable
EOF

USER node

RUN pnpm install directus-hook-sqlite-perf
```

When using docker compose you can easily point to this dockerfile and build your
custom image with ease.

Assuming your docker-compose.yml and Dockerfile are in the same folder, the
contents of docker-compose.yml could look like this:

```yaml
services:
  directus:
  build:
    context: .
  restart: unless-stopped
  ports:
    - '8055:8055'
  volumes:
    - ./data/database:/directus/database
    - ./data/extensions:/directus/extensions
  environment:
    SECRET: 'some-secret-key-here'
    DB_CLIENT: 'sqlite3'
```

To build the image, you "just" have to execute `docker compose build` to do so.

Note that this project also ships with an example docker-compose and even
dockerfile. Check the [directus](./directus) directory for more details on that.

Please also check the directus docs
on [docs.directus.io](https://docs.directus.io)
for more tips and examples on how to install and
[manage extensions](https://docs.directus.io/extensions/installing-extensions.html).

### Marketplace (not advised)

Generally, installing of this extension via Marketplace is not the preferred way
to go. This is because this extension will not be available in the marketplace
unless you have set the marketplace trust mode to `all`. This could lead to
security issues because the marketplace now shows ALL the non-sandboxed
extensions. You might not want nor need that.

The reason this extension is not able to use the sandbox mode is because it is
using the database connection directly. And currently it is not possible for
these kinds of extensions to run in sandboxed mode.

If you do want to change the trust-mode you can set the following environment
variable to do so.

```dotenv
MARKETPLACE_TRUST=all
```

## Configuration

### Journal Mode

SQLite includes a feature called WAL mode (Write-Ahead Logging), which allows
changes to be written to a separate log file before they're committed to the
main database. This method provides more concurrency as readers do not block
writers and a writer does not block readers. As a result, reading and writing
can proceed concurrently, potentially offering a significant performance
increase.

This is the command to enable WAL mode. It will be used for every connection
made to the database. Technically it will be enabled for all future connections
as well until you change is.

```sql
pragma journal_mode = wal;
```

To change the setting of `journal_mode` use the environment variable
`DHSP_JOURNAL_MODE`:

```dotenv
DHSP_JOURNAL_MODE=wal
```

### Synchronous Commit

The Synchronous setting has at least four possible values: `EXTRA`, `FULL`
(default), `NORMAL` and `OFF`. Setting the synchronous setting to `NORMAL`
should be safe when using WAL mode. It will sync less often as `EXTRA` or `FULL`
thus it will have some performance benefits. It can also be set to `OFF` but
that could lead to corruptions. Only use that if you really need the extra
performance.

```sql
pragma synchronous = normal;
```

To change the setting of `synchronous` use the environment variable
`DHSP_SYNCHRONOUS`:

```dotenv
DHSP_SYNCHRONOUS=normal
```

### Temporary files location

The temporary file location in SQLite determines where SQLite puts temporary
storage used for query processing. If your system has a faster disk or memory,
changing the location of temporary storage can speed up the operations that need
temporary storage, like sorting or creating indices. This extension will use the
memory as location to store the files.

```sql
pragma temp_store = memory;
```

To change the setting of `temp_store` use the environment variable
`DHSP_TEMP_STORE`:

```dotenv
DHSP_TEMP_STORE=memory
```

### Enable memory mapping

In SQLite, mmap_size is a setting that controls the use of memory-mapped I/O.
Memory-mapped I/O allows SQLite to access data in its database files as if it
were directly in memory, which can provide a significant speed boost for certain
workloads.

By default we set the value of `mmap_size` to 512MB. Make sure to adjust
accordingly. Advised is to look at the database filesize but also take into
account the total size of the memory available on your installation.

```sql
pragma mmap_size = 512000000;
```

To change the setting of `mmap_size` use the environment variable
`DHSP_MMAP_SIZE`:

```dotenv
DHSP_MMAP_SIZE=512000000
```

### Increase the page size

SQLite reads and writes one page at a time. Thus, a larger page size means less
I/O operations, which can be a performance advantage for large databases.
However, a larger page size might also mean more wasted disk space as the space
in a partially filled page cannot be used by other pages. Hence, you need to
choose a size based on the nature of your database operations.

This extension allows to set the `page_size` value but it is not included by
default and will only be used when the environment variable `DHSP_PAGE_SIZE` is
set.

**Note:** this can only be set before any data is inserted into the database or
while restoring a backup.

Setting the value will be done with the PRAGMA instruction:

```sql
pragma page_size = 32768;
```

To set the value of `page_size` use the environment variable
`DHSP_PAGE_SIZE`:

```dotenv
DHSP_PAGE_SIZE=32768
```

## Conclusion and Contributions

There are many SQLite options you can tweak and adjust to gain some improved
performance for your Directus installation. The five options provided as is are
most common I believe. I am open to add more options if needed, please use an
issue in this repository to open up a discussion to do so.
