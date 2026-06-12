#pragma once
#include <cstdint>
#include <vector>
#include <string>

namespace AudioEngine {
    void Initialize();
    void Shutdown();
    bool StartCapture();
    void StopCapture();
    
    // Retorna el nivel de pico de audio para el vúmetro (0 a 1)
    float GetPeakLevel(int channel);
    int GetSampleRate();

    std::vector<std::string> GetAudioDevices();
    void SelectDevice(int index);
    int GetSelectedDeviceIndex();
}
