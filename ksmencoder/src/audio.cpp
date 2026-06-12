#include "audio.h"
#include "encoder.h"
#include <iostream>
#include <cmath>
#include <chrono>
#include <thread>
#include <vector>

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <endpointvolume.h>
#include <avrt.h>
#include <Functiondiscoverykeys_devpkey.h>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "avrt.lib")

namespace AudioEngine {

    static bool isCapturing = false;
    static float peakLeft = 0.0f;
    static float peakRight = 0.0f;
    static std::thread captureThread;

    static IMMDeviceEnumerator* pEnumerator = nullptr;
    static IMMDevice* pDevice = nullptr;
    static IAudioClient* pAudioClient = nullptr;
    static IAudioCaptureClient* pCaptureClient = nullptr;
    static WAVEFORMATEX* pwfx = nullptr;
    static IAudioMeterInformation* pMeterInfo = nullptr;

    const IID IID_IMMDeviceEnumerator = __uuidof(IMMDeviceEnumerator);
    const CLSID CLSID_MMDeviceEnumerator = __uuidof(MMDeviceEnumerator);
    const IID IID_IAudioClient = __uuidof(IAudioClient);
    const IID IID_IAudioCaptureClient = __uuidof(IAudioCaptureClient);
    const IID IID_IAudioMeterInformation = __uuidof(IAudioMeterInformation);

    static std::vector<std::string> deviceNames;
    static std::vector<std::wstring> deviceIds;
    static std::vector<bool> isLoopbackList;
    static int selectedDeviceIndex = 0;

    std::string ws2s(const std::wstring& wstr) {
        if(wstr.empty()) return std::string();
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
        std::string strTo(size_needed, 0);
        WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
        return strTo;
    }

    std::vector<std::string> GetAudioDevices() {
        if (!deviceNames.empty()) return deviceNames;

        if (!pEnumerator) {
            HRESULT hr = CoCreateInstance(CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL, IID_IMMDeviceEnumerator, (void**)&pEnumerator);
            if (FAILED(hr)) return deviceNames;
        }

        deviceNames.push_back("[OUT] Salida Predeterminada");
        deviceIds.push_back(L"default_render");
        isLoopbackList.push_back(true);

        deviceNames.push_back("[IN] Entrada Predeterminada");
        deviceIds.push_back(L"default_capture");
        isLoopbackList.push_back(false);

        IMMDeviceCollection* pCollection = nullptr;
        HRESULT hr = pEnumerator->EnumAudioEndpoints(eAll, DEVICE_STATE_ACTIVE, &pCollection);
        if (SUCCEEDED(hr) && pCollection) {
            UINT count = 0;
            pCollection->GetCount(&count);
            for (UINT i = 0; i < count; i++) {
                IMMDevice* pEndpoint = nullptr;
                if (SUCCEEDED(pCollection->Item(i, &pEndpoint))) {
                    IMMEndpoint* pMM = nullptr;
                    EDataFlow flow = eRender;
                    if (SUCCEEDED(pEndpoint->QueryInterface(__uuidof(IMMEndpoint), (void**)&pMM))) {
                        pMM->GetDataFlow(&flow);
                        pMM->Release();
                    }

                    LPWSTR pwszID = NULL;
                    pEndpoint->GetId(&pwszID);
                    
                    IPropertyStore* pProps = nullptr;
                    if (SUCCEEDED(pEndpoint->OpenPropertyStore(STGM_READ, &pProps))) {
                        PROPVARIANT varName;
                        PropVariantInit(&varName);
                        if (SUCCEEDED(pProps->GetValue(PKEY_Device_FriendlyName, &varName))) {
                            std::string prefix = (flow == eRender) ? "[OUT] " : "[IN]  ";
                            deviceNames.push_back(prefix + ws2s(varName.pwszVal));
                            deviceIds.push_back(pwszID ? pwszID : L"");
                            isLoopbackList.push_back(flow == eRender);
                        }
                        PropVariantClear(&varName);
                        pProps->Release();
                    }
                    if (pwszID) CoTaskMemFree(pwszID);
                    pEndpoint->Release();
                }
            }
            pCollection->Release();
        }
        return deviceNames;
    }

    void SelectDevice(int index) {
        if (index >= 0 && index < (int)deviceNames.size()) {
            selectedDeviceIndex = index;
        }
    }

    int GetSelectedDeviceIndex() {
        return selectedDeviceIndex;
    }

    void CaptureLoop() {
        HRESULT hr;
        UINT32 packetLength = 0;
        BYTE* pData;
        UINT32 numFramesAvailable;
        DWORD flags;

        hr = pAudioClient->Start();
        if (FAILED(hr)) return;

        std::cout << "[WASAPI] Captura en tiempo real iniciada.\n";

        while (isCapturing) {
            hr = pCaptureClient->GetNextPacketSize(&packetLength);
            while (packetLength != 0) {
                hr = pCaptureClient->GetBuffer(&pData, &numFramesAvailable, &flags, NULL, NULL);
                if (FAILED(hr)) break;

                if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                    pData = NULL;
                } else {
                    std::vector<int16_t> pcmBuffer;
                    if (pwfx->wBitsPerSample == 32) {
                        float* pFloatData = (float*)pData;
                        int totalSamples = numFramesAvailable * pwfx->nChannels;
                        pcmBuffer.reserve(totalSamples);
                        for (int i = 0; i < totalSamples; ++i) {
                            float val = pFloatData[i];
                            if (val > 1.0f) val = 1.0f;
                            if (val < -1.0f) val = -1.0f;
                            pcmBuffer.push_back((int16_t)(val * 32767.0f));
                        }
                    } else if (pwfx->wBitsPerSample == 16) {
                        int16_t* pShortData = (int16_t*)pData;
                        int totalSamples = numFramesAvailable * pwfx->nChannels;
                        pcmBuffer.assign(pShortData, pShortData + totalSamples);
                    }
                    if (!pcmBuffer.empty()) {
                        Encoder::EncodeAndSend(pcmBuffer, pwfx->nSamplesPerSec, pwfx->nChannels);
                    }
                }

                hr = pCaptureClient->ReleaseBuffer(numFramesAvailable);
                hr = pCaptureClient->GetNextPacketSize(&packetLength);
            }
            
            if (pMeterInfo) {
                float peak = 0.0f;
                pMeterInfo->GetPeakValue(&peak);
                peakLeft = peak;
                peakRight = peak;
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }

        pAudioClient->Stop();
    }

    void Initialize() {
        std::cout << "[Audio] Inicializando WASAPI...\n";
        CoInitializeEx(NULL, COINIT_MULTITHREADED);
        GetAudioDevices();
    }

    void Shutdown() {
        StopCapture();
        CoUninitialize();
        std::cout << "[Audio] WASAPI Apagado.\n";
    }

    int GetSampleRate() {
        return pwfx ? pwfx->nSamplesPerSec : 44100;
    }

    bool StartCapture() {
        if (isCapturing) return true;

        if (!pEnumerator) {
            HRESULT hr = CoCreateInstance(CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL, IID_IMMDeviceEnumerator, (void**)&pEnumerator);
            if (FAILED(hr)) return false;
        }

        HRESULT hr;
        if (deviceIds[selectedDeviceIndex] == L"default_render") {
            hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
        } else if (deviceIds[selectedDeviceIndex] == L"default_capture") {
            hr = pEnumerator->GetDefaultAudioEndpoint(eCapture, eConsole, &pDevice);
        } else {
            hr = pEnumerator->GetDevice(deviceIds[selectedDeviceIndex].c_str(), &pDevice);
        }

        if (FAILED(hr) || !pDevice) {
            std::cout << "[Audio] Error al encontrar dispositivo.\n";
            return false;
        }

        hr = pDevice->Activate(IID_IAudioClient, CLSCTX_ALL, NULL, (void**)&pAudioClient);
        if (FAILED(hr)) return false;
        
        hr = pDevice->Activate(IID_IAudioMeterInformation, CLSCTX_ALL, NULL, (void**)&pMeterInfo);

        hr = pAudioClient->GetMixFormat(&pwfx);
        
        REFERENCE_TIME hnsRequestedDuration = 1000000; 
        
        DWORD streamFlags = isLoopbackList[selectedDeviceIndex] ? AUDCLNT_STREAMFLAGS_LOOPBACK : 0;
        hr = pAudioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags, hnsRequestedDuration, 0, pwfx, NULL);
        if (FAILED(hr)) {
            std::cout << "[Audio] Error inicializando IAudioClient.\n";
            return false;
        }

        hr = pAudioClient->GetService(IID_IAudioCaptureClient, (void**)&pCaptureClient);
        if (FAILED(hr)) return false;

        isCapturing = true;
        captureThread = std::thread(CaptureLoop);
        return true;
    }

    void StopCapture() {
        if (!isCapturing) return;
        isCapturing = false;
        
        if (captureThread.joinable()) {
            captureThread.join();
        }

        if (pwfx) { CoTaskMemFree(pwfx); pwfx = nullptr; }
        if (pCaptureClient) { pCaptureClient->Release(); pCaptureClient = nullptr; }
        if (pMeterInfo) { pMeterInfo->Release(); pMeterInfo = nullptr; }
        if (pAudioClient) { pAudioClient->Release(); pAudioClient = nullptr; }
        if (pDevice) { pDevice->Release(); pDevice = nullptr; }

        peakLeft = 0.0f;
        peakRight = 0.0f;
        std::cout << "[Audio] Captura detenida.\n";
    }

    float GetPeakLevel(int channel) {
        if (!isCapturing) return 0.0f;
        return (channel == 0) ? peakLeft : peakRight;
    }

}
