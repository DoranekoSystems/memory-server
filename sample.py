import requests
import time

### Setting ####
base_url = "http://192.168.11.18:3030"  # Replace with the actual URL
target_processname = "SurvivalShooter"  # Replace with processname


def get_processid_by_name(name):
    enumprocess_url = f"{base_url}/enumprocess"
    enumprocess_response = requests.get(enumprocess_url)
    if enumprocess_response.status_code == 200:
        process_list = enumprocess_response.json()
        pids = (
            process["pid"] for process in process_list if process["processname"] == name
        )
        pid_list = list(pids)
        if len(pid_list) == 0:
            print("Process name not found")
            return False
        else:
            pid = pid_list[0]
        return pid
    else:
        print(f"Failed to enumerate process:{enumprocess_response.content.decode()}")
        return False


def openprocess(pid):
    open_process_url = f"{base_url}/openprocess"
    open_process_payload = {"pid": pid}
    open_process_response = requests.post(
        open_process_url, json=open_process_payload, proxies={}
    )

    if open_process_response.status_code == 200:
        print(f"Process {pid} opened successfully")
    else:
        print(f"Failed to open process {pid}:{open_process_response.content.decode()}")
        return False


def get_address_ranges(protection):
    enum_regions_url = f"{base_url}/enumregions"
    enum_regions_response = requests.get(enum_regions_url)
    if enum_regions_response.status_code == 200:
        regions = enum_regions_response.json()["regions"]
        address_ranges = []
        for region in regions:
            _protection = region["protection"]
            if protection in _protection:
                start_address = int(region["start_address"], 16)
                end_address = int(region["end_address"], 16)
                address_ranges.append((start_address, end_address))
        return address_ranges
    else:
        print(f"Enumerate regions failed:{enum_regions_response.content.decode()}")
        return False


def find(pattern, address_ranges, is_regex=False, return_as_json=False):
    memory_scan_url = f"{base_url}/memoryscan"
    memory_scan_payload = {
        "pattern": pattern,
        "address_ranges": address_ranges,
        "is_regex": is_regex,
        "return_as_json": return_as_json,
        "scan_id": "Scan 1",
    }

    start = time.time()
    memory_scan_response = requests.post(memory_scan_url, json=memory_scan_payload)
    end = time.time()
    network_time = end - start

    if memory_scan_response.status_code == 200:
        result = memory_scan_response.json()
        print(f"Pattern found {result['found']} times")
        print(f"Network time: {network_time}")
        return result
    else:
        print(f"Memory scan failed:{memory_scan_response.content.decode()}")
        return False


def filter(pattern, is_regex=False, return_as_json=False):
    memory_filter_url = f"{base_url}/memoryfilter"
    memory_filter_payload = {
        "pattern": pattern,
        "is_regex": is_regex,
        "return_as_json": return_as_json,
        "scan_id": "Scan 1",
    }

    start = time.time()
    memory_filter_response = requests.post(
        memory_filter_url, json=memory_filter_payload
    )
    end = time.time()
    network_time = end - start

    if memory_filter_response.status_code == 200:
        result = memory_filter_response.json()
        print(f"Pattern found {result['found']} times")
        print(f"Network time: {network_time}")
        return result
    else:
        print(f"Memory filter failed:{memory_filter_response.content.decode()}")
        return False


pid = get_processid_by_name(target_processname)
if openprocess(pid) != False:
    address_ranges = get_address_ranges("rw")
    # Find url as regex
    url_regex = "https?://[\w/:%#\$&\?\(\)~\.=\+\-]+"
    ret = find(url_regex, address_ranges, True, True)
    if ret != False:
        print(f"found:{ret['found']}")
        for r in ret["matched_addresses"]:
            print(f"Address:{hex(r['address'])}　{bytes.fromhex(r['value']).decode()}")

    # Find integer value
    value = input(">input integer number:")
    pattern = int.to_bytes(int(value), 4, "little").hex()

    ret = find(pattern, address_ranges)
    if ret != False:
        value = input(">next:input integer number:")
        pattern = int.to_bytes(int(value), 4, "little").hex()
        filter(pattern)
