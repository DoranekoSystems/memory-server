import requests


class MemoryApi:
    def __init__(self, ip_address: str):
        self.ip_address = ip_address
        self.base_url = f"http://{ip_address}:3030/"

    def handle_response(self, response, on_success=None):
        if response.status_code == 200:
            data = on_success(response.json()) if on_success else response.json()
            return {"success": True, "status": 200, "data": data, "message": ""}
        else:
            return {
                "success": False,
                "status": response.status_code,
                "data": None,
                "message": f"Unexpected status code: {response.status_code}",
            }

    def handle_error(self, error):
        return {
            "success": False,
            "status": -1,
            "data": None,
            "message": f"Error: {str(error)}",
        }

    def read_process_memory(self, address: int, size: int):
        try:
            response = requests.get(
                self.base_url + "memory", params={"address": address, "size": size}
            )
            return self.handle_response(response)
        except requests.RequestException as e:
            return self.handle_error(e)

    def write_process_memory(self, address: int, buffer: bytes):
        try:
            response = requests.post(
                self.base_url + "memory",
                json={"address": address, "buffer": list(buffer)},
            )
            return self.handle_response(response)
        except requests.RequestException as e:
            return self.handle_error(e)

    def open_process(self, pid: int):
        try:
            response = requests.post(self.base_url + "process", json={"pid": pid})
            return self.handle_response(response)
        except requests.RequestException as e:
            return self.handle_error(e)

    def enum_processes(self):
        try:
            response = requests.get(self.base_url + "processes")
            return self.handle_response(response)
        except requests.RequestException as e:
            return self.handle_error(e)

    def generate_pointer_map(self):
        try:
            response = requests.post(
                self.base_url + "pointermap",
                json={
                    "target_address": 0x41AD26B00,
                    "max_depth": 7,
                    "max_offset": 0x1000,
                    "do_suspend": True,
                },
            )
            return self.handle_response(response)
        except requests.RequestException as e:
            return self.handle_error(e)


api = MemoryApi("192.168.11.17")
api.open_process(17755)
ret = api.generate_pointer_map()
print(ret)
