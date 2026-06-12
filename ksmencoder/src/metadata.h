#pragma once
#include <string>

namespace Metadata {
    void StartWatcher(const std::string& filePath, const char* server, const char* port, const char* mount, const char* password);
    void StopWatcher();
}
