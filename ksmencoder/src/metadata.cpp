#include "metadata.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <fstream>
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

namespace Metadata {

    static std::thread watcherThread;
    static bool isWatching = false;

    static std::string UrlEncode(const std::string& value) {
        std::string escaped;
        escaped.reserve(value.length());
        for (char c : value) {
            if (isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.' || c == '~') {
                escaped += c;
            } else if (c == ' ') {
                escaped += "%20";
            } else {
                char buf[5];
                snprintf(buf, sizeof(buf), "%%%02X", (unsigned char)c);
                escaped += buf;
            }
        }
        return escaped;
    }

    static const char* B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    static std::string Base64Encode(const std::string& in) {
        std::string out; int val=0, valb=-6;
        for (unsigned char c : in) { val=(val<<8)+c; valb+=8; while(valb>=0){ out+=B64[(val>>valb)&0x3F]; valb-=6; } }
        if(valb>-6) out+=B64[((val<<8)>>(valb+8))&0x3F];
        while(out.size()%4) out+='=';
        return out;
    }

    static void UpdateMetadata(const std::string& song, const std::string& server, const std::string& port, const std::string& mount, const std::string& password) {
        std::string host = server;
        if (host.substr(0,7)=="http://") host=host.substr(7);
        if (host.substr(0,8)=="https://") host=host.substr(8);
        if (!host.empty() && host.back()=='/') host.pop_back();

        std::string cleanMount = mount;
        if (!cleanMount.empty() && cleanMount.front() == '/') cleanMount = cleanMount.substr(1);

        std::string path = "/admin/metadata?mode=updinfo&mount=/" + cleanMount + "&song=" + UrlEncode(song);

        std::wstring whost(host.begin(), host.end());
        std::wstring wpath(path.begin(), path.end());

        HINTERNET hSession = WinHttpOpen(L"KSMEncoder/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (!hSession) return;

        HINTERNET hConnect = WinHttpConnect(hSession, whost.c_str(), std::stoi(port), 0);
        if (hConnect) {
            HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", wpath.c_str(), NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
            if (hRequest) {
                std::string auth = "Basic " + Base64Encode("source:" + password);
                std::wstring wauth(auth.begin(), auth.end());
                std::wstring header = L"Authorization: " + wauth + L"\r\n";
                WinHttpAddRequestHeaders(hRequest, header.c_str(), (ULONG)-1L, WINHTTP_ADDREQ_FLAG_ADD);

                if (WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) {
                    WinHttpReceiveResponse(hRequest, NULL);
                    std::cout << "[Metadata] Actualizado en Zeno.fm: " << song << "\n";
                }
                WinHttpCloseHandle(hRequest);
            }
            WinHttpCloseHandle(hConnect);
        }
        WinHttpCloseHandle(hSession);
    }

    void WatcherLoop(std::string filePath, std::string server, std::string port, std::string mount, std::string password) {
        FILETIME lastWriteTime = {0};
        std::string currentSong = "";

        while (isWatching) {
            std::wstring wFilePath(filePath.begin(), filePath.end());
            HANDLE hFile = CreateFileW(wFilePath.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
            if (hFile != INVALID_HANDLE_VALUE) {
                FILETIME newWriteTime;
                if (GetFileTime(hFile, NULL, NULL, &newWriteTime)) {
                    if (CompareFileTime(&lastWriteTime, &newWriteTime) != 0) {
                        lastWriteTime = newWriteTime;
                        DWORD fileSize = GetFileSize(hFile, NULL);
                        if (fileSize > 0 && fileSize < 4096) {
                            std::string content(fileSize, '\0');
                            DWORD bytesRead;
                            if (ReadFile(hFile, &content[0], fileSize, &bytesRead, NULL)) {
                                content.resize(bytesRead);
                                while (!content.empty() && (content.back() == '\r' || content.back() == '\n')) content.pop_back();
                                
                                if (content != currentSong && !content.empty()) {
                                    currentSong = content;
                                    UpdateMetadata(currentSong, server, port, mount, password);
                                }
                            }
                        }
                    }
                }
                CloseHandle(hFile);
            }
            for (int i=0; i<20 && isWatching; i++) std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }

    void StartWatcher(const std::string& filePath, const char* server, const char* port, const char* mount, const char* password) {
        if (isWatching || filePath.empty()) return;
        isWatching = true;
        watcherThread = std::thread(WatcherLoop, filePath, server, port, mount, password);
        std::cout << "[Metadata] Observando archivo: " << filePath << "\n";
    }

    void StopWatcher() {
        if (!isWatching) return;
        isWatching = false;
        if (watcherThread.joinable()) {
            watcherThread.join();
        }
        std::cout << "[Metadata] Observador detenido.\n";
    }
}
