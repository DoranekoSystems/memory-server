# NexDbg

Next Generation Browser-based Process Memory Analyser.  
All data is bundled in one binary.

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

<img width="500" alt="img1" src="https://github.com/user-attachments/assets/2998770f-fcf7-4cdf-9272-5e76753029e4">

### Setting

Enter the ip of the iPhone in the 「IP Address」 field and press the 「Connect」 button.

Next, select a process and press the 「Open Process」 button.

<img width="500" alt="img2" src="https://github.com/DoranekoSystems/memory-server/assets/96031346/4aa7bf02-c97a-4e1b-97da-8778e6017550">

### Memory Scan

<img width="500" alt="img3" src="https://github.com/user-attachments/assets/78bdac66-7ed4-440d-b5af-0e7e23f74f0b">

### Debugger

Only watchpoints are supported in the iOS environment.

<img width="500" alt="img4" src="https://github.com/user-attachments/assets/957910ec-0506-4951-b68b-1476764a3ae1">

### File Explorer

The feature allows viewing and downloading files on the device

<img width="500" alt="img4" src="https://github.com/user-attachments/assets/9873a16a-57f4-42a5-8244-2cdeaf1278a2">

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

# Build

## Running the GitHub Actions Workflow Manually

To build the project using GitHub Actions, follow these steps:

1. Fork this repo

2. Go to the "Actions" tab in your forked repository.

3. In the left sidebar, click on the "Build" workflow.

4. Above the list of workflow runs, click on "Run workflow".

5. In the dialog box that appears:

   - Select the branch you want to run the workflow on (usually "main").
   - Enter a version tag for this build (e.g., "v1.0.0").

6. Click "Run workflow" to start the build process.

7. The workflow will start running, and you can monitor its progress in the Actions tab.

8. Once the workflow completes successfully, you can download the built artifacts:
   - Go to the completed workflow run.
   - Scroll down to the "Artifacts" section.
   - Click on the artifact names to download:
     - `memory-server-ios-arm64-[version]`
     - `memory-server-android-arm64-[version]`

Note: Make sure you have the necessary permissions in your forked repository to run workflows and access artifacts.

## Manual build

For more information, please visit [Wiki](https://github.com/DoranekoSystems/memory-server/wiki/Build)

# Credits

[frida-ios-dump](https://github.com/AloneMonkey/frida-ios-dump)
