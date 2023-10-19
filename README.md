# memory-server

High-Speed Memory Scanner &amp; Analyzer with REST API.

# Build

## Android

Set NDK/toolchains/llvm/prebuild/{os_specific}/bin as environment variable NDK_BIN_PATH.

```sh
./build.sh --target android
```

## iOS

A Mac is required for build.

```sh
./build.sh --target ios
```

# Usage

## iOS

Jailbreaking of iphone is required.  
Place your PC and iphone in the same network.  
Place memory-server and Entitlements.plist in /usr/bin.

Connect to the iphone via ssh.

```sh
cd /usr/bin
ldid -SEntitlements.plist memory-server
./memory-server
```

The httpserver starts at port `3030`.

### Sample

`sample.py`
URL enumeration in memory and simple memory analysis

# Memory Management API

This API provides endpoints to interact with the memory and processes in the system.

## Table of Contents

- [Endpoints](#endpoints)
  - [`/enumprocess`](#enumprocess)
  - [`/openprocess`](#openprocess)
  - [`/enumregion`](#enumregion)
  - [`/readmemory`](#readmemory)
  - [`/memoryscan`](#memoryscan)
  - [`/memoryfilter`](#memoryfilter)

## Endpoints

### `/enumprocess`

| Attribute      | Value                 |
| -------------- | --------------------- |
| **Endpoint**   | `/enumprocess`        |
| **Method**     | `GET`                 |
| **Parameters** | None                  |
| **Returns**    | A list of process IDs |

#### Description

Retrieve a list of running processes on the system.

#### Example Request

`GET /enumprocess`

### `/openprocess`

| Attribute      | Value                   |
| -------------- | ----------------------- |
| **Endpoint**   | `/openprocess`          |
| **Method**     | `POST`                  |
| **Parameters** | `pid` (int)             |
| **Returns**    | A handle to the process |

#### Description

Open a handle to a process for reading and writing memory.

#### Example Request

```json
POST /openprocess
{
    "pid": 1234
}
```

### `/enumregion`

| Attribute      | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| **Endpoint**   | `/enumregion`                                                                         |
| **Method**     | `GET`                                                                                 |
| **Parameters** | None                                                                                  |
| **Returns**    | A list of memory regions with information such as start address, size, and protection |

#### Description

Retrieve information about the memory regions of a process.

#### Example Request

`GET /enumregion`

### `/readmemory`

| Attribute      | Value                                        |
| -------------- | -------------------------------------------- |
| **Endpoint**   | `/readmemory`                                |
| **Method**     | `POST`                                       |
| **Parameters** | `address` (int), `size` (int)                |
| **Returns**    | Binary data representing the memory contents |

#### Description

Retrieve the contents of a specific memory address in a process.

#### Example Request

```json
POST /readmemory
{
    "address": 0x7ffee000,
    "size": 128
}
```

### `/memoryscan`

| Attribute      | Value                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **Endpoint**   | `/memoryscan`                                                                                    |
| **Method**     | `POST`                                                                                           |
| **Parameters** | `pattern`(string), `address_ranges`(list as [int,int]), `is_regex`(bool), `return_as_json`(bool) |
| **Returns**    | A list of memory addresses where the pattern is found                                            |

#### Description

Scan the memory of a process for specific values or patterns.

#### Example Request

```json
POST /memoryscan
{
   "pattern": "64000000",
   "address_ranges": [
      [
         0x7ffee000,
         0x7ffff000
      ]...
   ],
   "is_regex": false,
   "return_as_json": true
}
```

### `/memoryfilter`

| Attribute      | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Endpoint**   | `/memoryfilter`                                             |
| **Method**     | `POST`                                                      |
| **Parameters** | `pattern`(string), `is_regex`(bool), `return_as_json`(bool) |
| **Returns**    | A list of memory addresses that match the filter criteria   |

#### Description

Filter the memory of a process based on address patterns.

#### Example Request

```json
POST /memoryfilter
{
   "pattern": "deadbeaf",
   "is_regex": false,
   "return_as_json": true
}
```
