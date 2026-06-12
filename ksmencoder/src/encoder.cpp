// encoder.cpp - Motor real via lame.exe (proceso hijo con pipes)
#include "encoder.h"
#include <iostream>
#include <string>
#include <vector>
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

namespace Encoder {

    static bool    isConnected = false;
    static SOCKET  sock        = INVALID_SOCKET;
    static HANDLE  hLameStdin  = INVALID_HANDLE_VALUE; 
    static HANDLE  hLameStdout = INVALID_HANDLE_VALUE; 
    static PROCESS_INFORMATION piLame = {};
    static HANDLE  hReadThread = NULL;
    static bool    readThreadRunning = false;

    static const char* B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    static std::string base64(const std::string& in) {
        std::string out; int val=0, valb=-6;
        for (unsigned char c : in) { val=(val<<8)+c; valb+=8; while(valb>=0){ out+=B64[(val>>valb)&0x3F]; valb-=6; } }
        if(valb>-6) out+=B64[((val<<8)>>(valb+8))&0x3F];
        while(out.size()%4) out+='=';
        return out;
    }

    static DWORD WINAPI ReadLameAndSend(LPVOID) {
        BYTE buf[8192];
        DWORD bytesRead = 0;
        while (readThreadRunning) {
            BOOL ok = ReadFile(hLameStdout, buf, sizeof(buf), &bytesRead, NULL);
            if (!ok || bytesRead == 0) break;
            if (isConnected && sock != INVALID_SOCKET) {
                int sent = send(sock, (const char*)buf, bytesRead, 0);
                if (sent == SOCKET_ERROR) isConnected = false;
            }
        }
        return 0;
    }

    bool Connect(const char* server, const char* port, const char* mount, const char* password, int sampleRate) {
        if (isConnected) return true;

        char exePath[MAX_PATH] = {};
        GetModuleFileNameA(NULL, exePath, MAX_PATH);
        std::string exeDir = exePath;
        exeDir = exeDir.substr(0, exeDir.find_last_of("\\/"));
        std::string lamePath = exeDir + "\\lame.exe";

        if (GetFileAttributesA(lamePath.c_str()) == INVALID_FILE_ATTRIBUTES) {
            std::cout << "[Encoder] ERROR: No se encuentra lame.exe en:\n" << lamePath << "\n";
            return false;
        }

        SECURITY_ATTRIBUTES sa = { sizeof(sa), NULL, TRUE };
        HANDLE hReadPcm, hWritePcm, hReadMp3, hWriteMp3;

        if (!CreatePipe(&hReadPcm,  &hWritePcm, &sa, 0) || !CreatePipe(&hReadMp3, &hWriteMp3, &sa, 0)) {
            std::cout << "[Encoder] ERROR interno al crear tuberias.\n";
            return false;
        }
        SetHandleInformation(hWritePcm, HANDLE_FLAG_INHERIT, 0);
        SetHandleInformation(hReadMp3,  HANDLE_FLAG_INHERIT, 0);

        float sr_khz = sampleRate / 1000.0f;
        char sr_str[16];
        snprintf(sr_str, sizeof(sr_str), "%.1f", sr_khz);
        // -r = raw pcm, -s [entrada], --resample 44.1 (obligatorio para Zeno)
        std::string cmd = "\"" + lamePath + "\" -r -s " + std::string(sr_str) + " --resample 44.1 --bitwidth 16 --signed -m j -b 128 - -";

        STARTUPINFOA si = {};
        si.cb          = sizeof(si);
        si.hStdInput   = hReadPcm;
        si.hStdOutput  = hWriteMp3;
        si.hStdError   = GetStdHandle(STD_ERROR_HANDLE);
        si.dwFlags     = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;

        // Se usa std::vector para asegurar que la memoria de cmd line es modificable
        std::vector<char> cmdBuffer(cmd.begin(), cmd.end());
        cmdBuffer.push_back('\0');

        if (!CreateProcessA(NULL, cmdBuffer.data(), NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &piLame)) {
            std::cout << "[Encoder] ERROR al lanzar lame.exe. Codigo: " << GetLastError() << "\n";
            CloseHandle(hReadPcm); CloseHandle(hWritePcm);
            CloseHandle(hReadMp3); CloseHandle(hWriteMp3);
            return false;
        }

        CloseHandle(hReadPcm);  
        CloseHandle(hWriteMp3); 

        hLameStdin  = hWritePcm; 
        hLameStdout = hReadMp3;  

        WSADATA wsaData; WSAStartup(MAKEWORD(2,2), &wsaData);
        addrinfo hints = {}, *result = NULL;
        hints.ai_family = AF_UNSPEC; hints.ai_socktype = SOCK_STREAM; hints.ai_protocol = IPPROTO_TCP;

        std::string host = server;
        if (host.substr(0,7)=="http://")  host=host.substr(7);
        if (host.substr(0,8)=="https://") host=host.substr(8);
        if (!host.empty() && host.back()=='/') host.pop_back();

        if (getaddrinfo(host.c_str(), port, &hints, &result) != 0) return false;
        for (auto* p = result; p; p = p->ai_next) {
            sock = socket(p->ai_family, p->ai_socktype, p->ai_protocol);
            if (sock==INVALID_SOCKET) continue;
            if (connect(sock, p->ai_addr, (int)p->ai_addrlen)==0) break;
            closesocket(sock); sock=INVALID_SOCKET;
        }
        freeaddrinfo(result);

        if (sock == INVALID_SOCKET) {
            std::cout << "[Encoder] ERROR: Conexion rechazada por " << host << ":" << port << "\n";
            return false;
        }

        std::string auth = base64("source:" + std::string(password));
        std::string req  = "SOURCE /" + std::string(mount) + " HTTP/1.0\r\n"
                         + "Authorization: Basic " + auth + "\r\n"
                         + "Content-Type: audio/mpeg\r\n"
                         + "Ice-Name: KSM Encoder\r\n\r\n";
        send(sock, req.c_str(), (int)req.size(), 0);

        char resp[512] = {};
        int n = recv(sock, resp, sizeof(resp)-1, 0);
        if (n > 0) {
            std::string s(resp, n);
            std::cout << "[Encoder] Zeno.fm: " << s.substr(0, s.find('\n')) << "\n";
            if (s.find("200") == std::string::npos) {
                std::cout << "[Encoder] ERROR: Zeno.fm rechazo credenciales.\n";
                closesocket(sock); sock=INVALID_SOCKET; WSACleanup(); return false;
            }
        }

        readThreadRunning = true;
        hReadThread = CreateThread(NULL, 0, ReadLameAndSend, NULL, 0, NULL);
        isConnected = true;
        std::cout << "[Encoder] Conectado! Enviando audio via lame.exe\n";
        return true;
    }

    void Disconnect() {
        if (!isConnected) return;
        isConnected = false;
        readThreadRunning = false;

        if (hLameStdin != INVALID_HANDLE_VALUE) { CloseHandle(hLameStdin); hLameStdin = INVALID_HANDLE_VALUE; }
        if (hReadThread) { WaitForSingleObject(hReadThread, 2000); CloseHandle(hReadThread); hReadThread = NULL; }
        if (hLameStdout != INVALID_HANDLE_VALUE) { CloseHandle(hLameStdout); hLameStdout = INVALID_HANDLE_VALUE; }
        
        if (piLame.hProcess) {
            TerminateProcess(piLame.hProcess, 0);
            CloseHandle(piLame.hProcess);
            CloseHandle(piLame.hThread);
            piLame = {};
        }
        if (sock != INVALID_SOCKET) { closesocket(sock); sock=INVALID_SOCKET; }
        WSACleanup();
        std::cout << "[Encoder] Transmision detenida.\n";
    }

    void EncodeAndSend(const std::vector<int16_t>& pcmBuffer, int sampleRate, int channels) {
        if (!isConnected || pcmBuffer.empty()) return;
        if (hLameStdin == INVALID_HANDLE_VALUE) return;

        DWORD written = 0;
        WriteFile(hLameStdin, pcmBuffer.data(), (DWORD)(pcmBuffer.size() * sizeof(int16_t)), &written, NULL);
    }
}
