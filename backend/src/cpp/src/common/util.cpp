#include "util.h"

std::string map_vector_to_json_string(
    const std::vector<std::map<std::string, uint64_t>>& map_vector)
{
    std::ostringstream json;
    json << "{";

    for (size_t i = 0; i < map_vector.size(); ++i)
    {
        const auto& map = map_vector[i];
        for (const auto& [key, value] : map)
        {
            if (i > 0 || &key != &map.begin()->first)
            {
                json << ",";
            }
            json << "\"" << key << "\":\"0x" << std::hex << std::uppercase << std::setw(16)
                 << std::setfill('0') << value << "\"";
        }
    }

    json << "}";
    return json.str();
}