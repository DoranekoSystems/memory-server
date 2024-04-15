# memory-server

High-Speed Memory Scanner &amp; Analyzer with REST API.

# Usage

## iOS

### Run

#### with a Jailbroken iPhone

Place your PC and iphone in the same network.  
Place memory-server and Entitlements.plist in /usr/bin.

Connect to the iphone via ssh.

```sh
cd /usr/bin
ldid -SEntitlements.plist memory-server
./memory-server
```

The httpserver starts at port `3030`.

#### without a Jailbroken iPhone

Set up the same way as FridaGadget to force loading of libmemory_server.dylib.  
Connect to the network from Browser as usual.  
Log output is written to NSLog.

### Connect from browser

Connect to memory-server from a browser on your PC.

```sh
http://{iPhone's ip}:3030/index.html
```

The following top page will be displayed.

<img width="500" alt="img1" src="https://github.com/DoranekoSystems/memory-server/assets/96031346/01d846b5-df98-4925-9b3c-b63d66b10d89">

### Setting

Enter the ip of the iPhone in the 「IP Address」 field and press the 「Connect」 button.

Next, select a process and press the 「Open Process」 button.

<img width="500" alt="img2" src="https://github.com/DoranekoSystems/memory-server/assets/96031346/4aa7bf02-c97a-4e1b-97da-8778e6017550">

### Memory Scan

<img width="500" alt="img3" src="https://github.com/DoranekoSystems/memory-server/assets/96031346/f230d850-646f-4fd9-8ee4-4265f2e20e1a">

## Android

### Run

#### with a Rooted Android

Network connection is identical to iphone.  

```sh
cd /data/local/tmp
su
./memory-server
```

#### without a Rooted Android

Set up the same way as FridaGadget to force loading of libmemory_server.so.   
This method allows the android device to operate on its own.  

<img height="500" alt="img4" src="https://github.com/DoranekoSystems/memory-server/assets/96031346/0a629a2c-6401-4f2c-b67a-bf8b9ad3d682">

