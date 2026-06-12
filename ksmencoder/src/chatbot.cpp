#include "chatbot.h"
#include <iostream>
#include <thread>
#include <mutex>
#include <atomic>
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#include <nlohmann/json.hpp>

#pragma comment(lib, "winhttp.lib")

using json = nlohmann::json;

namespace Chatbot {

    static std::string apiKey = "";
    static std::vector<Message> history;
    static std::mutex historyMutex;
    static std::atomic<bool> isThinking(false);

    const std::string SYSTEM_PROMPT = 
        "Eres el asistente integrado de KSM Encoder, una aplicación en C++ que captura audio de Windows nativo "
        "y lo transmite en vivo a Icecast/Zeno.fm usando lame.exe mediante pipes invisibles. "
        "Sé breve, útil y autorreferencial. Sabes que estás operando dentro del panel derecho del codificador. "
        "Ayuda al usuario a configurar su radio si te lo pide, o a entender cómo funciona KSM Encoder.";

    void Initialize() {
        std::lock_guard<std::mutex> lock(historyMutex);
        history.push_back({"model", "Hola. Soy el cerebro de KSM Encoder. Para activar mis funciones de IA, por favor envíame tu API Key de Gemini en tu próximo mensaje."});
    }

    void Shutdown() {
        // Nada crítico que liberar por ahora
    }

    std::vector<Message> GetHistory() {
        std::lock_guard<std::mutex> lock(historyMutex);
        return history;
    }

    bool HasApiKey() {
        return !apiKey.empty();
    }

    bool IsThinking() {
        return isThinking.load();
    }

    static void AddMessage(const std::string& role, const std::string& text) {
        std::lock_guard<std::mutex> lock(historyMutex);
        history.push_back({role, text});
    }

    static void RequestGeminiAPI(std::string promptText) {
        isThinking.store(true);

        HINTERNET hSession = WinHttpOpen(L"KSMEncoder/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (!hSession) {
            AddMessage("model", "Error interno: WinHttpOpen falló.");
            isThinking.store(false);
            return;
        }

        HINTERNET hConnect = WinHttpConnect(hSession, L"generativelanguage.googleapis.com", INTERNET_DEFAULT_HTTPS_PORT, 0);
        if (!hConnect) {
            AddMessage("model", "Error interno: WinHttpConnect falló.");
            WinHttpCloseHandle(hSession);
            isThinking.store(false);
            return;
        }

        std::string path = "/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
        std::wstring wPath(path.begin(), path.end());

        HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", wPath.c_str(), NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE);
        if (!hRequest) {
            AddMessage("model", "Error interno: WinHttpOpenRequest falló.");
            WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
            isThinking.store(false);
            return;
        }

        // Construir JSON
        json j;
        j["system_instruction"]["parts"][0]["text"] = SYSTEM_PROMPT;
        
        // Agregar contexto del historial
        std::unique_lock<std::mutex> lock(historyMutex);
        for (const auto& msg : history) {
            if (msg.role == "user" || msg.role == "model") {
                // Gemini llama "user" y "model" a los roles
                json part; part["text"] = msg.text;
                json content; content["role"] = msg.role; content["parts"].push_back(part);
                j["contents"].push_back(content);
            }
        }
        lock.unlock();

        std::string reqBody = j.dump();

        std::wstring headers = L"Content-Type: application/json\r\n";
        BOOL bResults = WinHttpSendRequest(hRequest, headers.c_str(), (DWORD)headers.length(), (LPVOID)reqBody.c_str(), (DWORD)reqBody.size(), (DWORD)reqBody.size(), 0);

        if (bResults) bResults = WinHttpReceiveResponse(hRequest, NULL);

        if (bResults) {
            std::string responseStr;
            DWORD dwSize = 0;
            DWORD dwDownloaded = 0;
            do {
                dwSize = 0;
                WinHttpQueryDataAvailable(hRequest, &dwSize);
                if (dwSize == 0) break;
                char* pszOutBuffer = new char[dwSize + 1];
                ZeroMemory(pszOutBuffer, dwSize + 1);
                if (WinHttpReadData(hRequest, (LPVOID)pszOutBuffer, dwSize, &dwDownloaded)) {
                    responseStr.append(pszOutBuffer, dwDownloaded);
                }
                delete[] pszOutBuffer;
            } while (dwSize > 0);

            try {
                json resJson = json::parse(responseStr);
                if (resJson.contains("candidates") && resJson["candidates"].size() > 0) {
                    std::string reply = resJson["candidates"][0]["content"]["parts"][0]["text"].get<std::string>();
                    AddMessage("model", reply);
                } else if (resJson.contains("error")) {
                    std::string errMsg = resJson["error"]["message"].get<std::string>();
                    AddMessage("model", "Error de API: " + errMsg);
                } else {
                    AddMessage("model", "Respuesta inesperada de Gemini.");
                }
            } catch (const std::exception& e) {
                AddMessage("model", std::string("Error al parsear respuesta JSON: ") + e.what());
            }
        } else {
            AddMessage("model", "Error de red al intentar contactar a Gemini.");
        }

        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        
        isThinking.store(false);
    }

    void SendUserMessage(const std::string& text) {
        if (text.empty()) return;

        AddMessage("user", text);

        if (!HasApiKey()) {
            // Asumimos que el primer texto que envía si no hay API key ES la API key
            // Chequeo básico de longitud de Gemini API Key (usualmente 39 caracteres)
            if (text.length() > 30 && text.find(" ") == std::string::npos) {
                apiKey = text;
                AddMessage("model", "API Key registrada correctamente en esta sesión. ¿En qué puedo ayudarte?");
            } else {
                AddMessage("model", "Eso no parece una API Key válida. Por favor, pega tu clave de Gemini (suele tener ~39 caracteres sin espacios).");
            }
            return;
        }

        // Lanzar thread para la petición HTTP
        std::thread apiThread(RequestGeminiAPI, text);
        apiThread.detach(); // Dejarlo correr libre sin bloquear
    }

}
