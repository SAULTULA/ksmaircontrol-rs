#pragma once

#include <vector>
#include <cstdint>

namespace Encoder {
    bool Connect(const char* server, const char* port, const char* mount, const char* password, int sampleRate);
    void Disconnect();
    void EncodeAndSend(const std::vector<int16_t>& pcmBuffer, int sampleRate, int channels);
}
