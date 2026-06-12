#include "gui.h"
#include "imgui.h"
#include "audio.h"
#include "encoder.h"
#include "metadata.h"
#include <string>
#include <fstream>
#include <vector>

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commdlg.h>
#include <SDL_syswm.h>

extern HWND g_hwnd; // HWND de la ventana principal, provisto por main.cpp

namespace GUI {

    static char serverUrl[256] = "http://stream.zeno.fm";
    static char port[16] = "80";
    static char mountPoint[64] = "/tu_mount";
    static char password[128] = "tu_password";
    static char metadataPath[260] = "";
    
    static int codecIndex = 0;
    static const char* codecItems[] = { "MP3", "AAC", "AAC+" };

    static int bitrateIndex = 1;
    static const char* bitrateItems[] = { "64 kbps", "128 kbps", "192 kbps", "320 kbps" };

    static bool isStreaming = false;

    static void LoadConfig(const std::string& path) {
        std::ifstream f(path);
        if (f.is_open()) {
            std::string line;
            if (std::getline(f, line)) snprintf(serverUrl, 256, "%s", line.c_str());
            if (std::getline(f, line)) snprintf(port, 16, "%s", line.c_str());
            if (std::getline(f, line)) snprintf(mountPoint, 64, "%s", line.c_str());
            if (std::getline(f, line)) snprintf(password, 128, "%s", line.c_str());
            if (std::getline(f, line)) snprintf(metadataPath, 260, "%s", line.c_str());
        }
    }

    static void SaveConfig(const std::string& path) {
        std::ofstream f(path);
        if (f.is_open()) {
            f << serverUrl << "\n" << port << "\n" << mountPoint << "\n" << password << "\n" << metadataPath << "\n";
        }
    }

    static void ApplyModernStyle() {
        ImGuiStyle& style = ImGui::GetStyle();
        style.WindowRounding = 8.0f;
        style.FrameRounding = 6.0f;
        style.ScrollbarRounding = 6.0f;
        style.GrabRounding = 6.0f;
        
        style.Colors[ImGuiCol_WindowBg] = ImVec4(0.06f, 0.06f, 0.06f, 1.0f);
        style.Colors[ImGuiCol_Header] = ImVec4(0.12f, 0.12f, 0.12f, 1.0f);
        style.Colors[ImGuiCol_HeaderHovered] = ImVec4(0.16f, 0.16f, 0.16f, 1.0f);
        style.Colors[ImGuiCol_HeaderActive] = ImVec4(0.20f, 0.20f, 0.20f, 1.0f);
        style.Colors[ImGuiCol_Button] = ImVec4(0.15f, 0.15f, 0.15f, 1.0f);
        style.Colors[ImGuiCol_ButtonHovered] = ImVec4(0.20f, 0.20f, 0.20f, 1.0f);
        style.Colors[ImGuiCol_ButtonActive] = ImVec4(0.25f, 0.25f, 0.25f, 1.0f);
        style.Colors[ImGuiCol_FrameBg] = ImVec4(0.11f, 0.11f, 0.11f, 1.0f);
        style.Colors[ImGuiCol_FrameBgHovered] = ImVec4(0.15f, 0.15f, 0.15f, 1.0f);
        style.Colors[ImGuiCol_FrameBgActive] = ImVec4(0.18f, 0.18f, 0.18f, 1.0f);
    }

    void Render() {
        static bool isInit = false;
        if (!isInit) {
            ApplyModernStyle();
            LoadConfig("ksm_config.txt");
            isInit = true;
        }

        const ImGuiViewport* viewport = ImGui::GetMainViewport();
        ImGui::SetNextWindowPos(viewport->WorkPos);
        ImGui::SetNextWindowSize(viewport->WorkSize);
        ImGui::SetNextWindowBgAlpha(1.0f);

        ImGuiWindowFlags windowFlags = ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoCollapse | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoBringToFrontOnFocus | ImGuiWindowFlags_NoNavFocus;

        ImGui::Begin("KSMEncoder", nullptr, windowFlags);

        ImGui::TextColored(ImVec4(0.0f, 0.8f, 1.0f, 1.0f), "KSMEncoder");
        ImGui::SameLine(ImGui::GetWindowWidth() - 70);
        if (ImGui::Button("Ocultar", ImVec2(60, 20))) {
            if (g_hwnd) {
                ShowWindow(g_hwnd, SW_HIDE);
            }
        }
        
        ImGui::Separator();
        ImGui::Spacing();
        
        ImGui::Text("Servidor Zeno.fm");
        ImGui::PushItemWidth(-1);
        ImGui::InputTextWithHint("##Servidor", "Servidor", serverUrl, IM_ARRAYSIZE(serverUrl));
        ImGui::InputTextWithHint("##Puerto", "Puerto", port, IM_ARRAYSIZE(port));
        ImGui::InputTextWithHint("##Mount", "Mount Point", mountPoint, IM_ARRAYSIZE(mountPoint));
        ImGui::InputTextWithHint("##Pass", "Contrasena", password, IM_ARRAYSIZE(password), ImGuiInputTextFlags_Password);
        ImGui::PopItemWidth();

        if (ImGui::Button("Guardar", ImVec2(100, 0))) {
            SaveConfig("ksm_config.txt");
        }
        ImGui::SameLine();
        if (ImGui::Button("Exportar", ImVec2(100, 0))) {
            OPENFILENAMEA ofn;
            char szFile[260] = {0};
            ZeroMemory(&ofn, sizeof(ofn));
            ofn.lStructSize = sizeof(ofn);
            ofn.hwndOwner = g_hwnd;
            ofn.lpstrFile = szFile;
            ofn.nMaxFile = sizeof(szFile);
            ofn.lpstrFilter = "Text Files\0*.txt\0All Files\0*.*\0";
            ofn.nFilterIndex = 1;
            ofn.lpstrDefExt = "txt";
            ofn.Flags = OFN_PATHMUSTEXIST | OFN_OVERWRITEPROMPT;
            if (GetSaveFileNameA(&ofn) == TRUE) {
                SaveConfig(ofn.lpstrFile);
            }
        }
        ImGui::SameLine();
        if (ImGui::Button("Importar", ImVec2(100, 0))) {
            OPENFILENAMEA ofn;
            char szFile[260] = {0};
            ZeroMemory(&ofn, sizeof(ofn));
            ofn.lStructSize = sizeof(ofn);
            ofn.hwndOwner = g_hwnd;
            ofn.lpstrFile = szFile;
            ofn.nMaxFile = sizeof(szFile);
            ofn.lpstrFilter = "Text Files\0*.txt\0All Files\0*.*\0";
            ofn.nFilterIndex = 1;
            ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST;
            if (GetOpenFileNameA(&ofn) == TRUE) {
                LoadConfig(ofn.lpstrFile);
                SaveConfig("ksm_config.txt"); // Guardar por defecto
            }
        }

        ImGui::Spacing();
        ImGui::Separator();
        ImGui::Spacing();

        ImGui::Text("Ajustes de Audio y Metadatos");
        ImGui::PushItemWidth(-1);
        
        // --- Selector de Metadatos ---
        ImGui::TextColored(ImVec4(0.7f, 0.7f, 0.7f, 1.0f), "Archivo Metadatos (.txt de tu automatizador):");
        ImGui::PushItemWidth(ImGui::GetWindowWidth() - 100);
        ImGui::InputText("##MetaPath", metadataPath, IM_ARRAYSIZE(metadataPath));
        ImGui::PopItemWidth();
        ImGui::SameLine();
        if (ImGui::Button("Examinar", ImVec2(80, 0))) {
            OPENFILENAMEA ofn;
            char szFile[260] = {0};
            ZeroMemory(&ofn, sizeof(ofn));
            ofn.lStructSize = sizeof(ofn);
            ofn.hwndOwner = g_hwnd;
            ofn.lpstrFile = szFile;
            ofn.nMaxFile = sizeof(szFile);
            ofn.lpstrFilter = "Text Files\0*.txt\0All Files\0*.*\0";
            ofn.nFilterIndex = 1;
            ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST;
            if (GetOpenFileNameA(&ofn) == TRUE) {
                snprintf(metadataPath, 260, "%s", ofn.lpstrFile);
            }
        }
        
        ImGui::Spacing();
        ImGui::Separator();
        ImGui::Spacing();
        
        // --- Selector de Placa de Sonido ---
        std::vector<std::string> devices = AudioEngine::GetAudioDevices();
        int selectedDev = AudioEngine::GetSelectedDeviceIndex();
        
        if (ImGui::BeginCombo("##Dispositivo", devices.empty() ? "Buscando..." : devices[selectedDev].c_str())) {
            for (int n = 0; n < (int)devices.size(); n++) {
                bool is_selected = (selectedDev == n);
                if (ImGui::Selectable(devices[n].c_str(), is_selected)) {
                    AudioEngine::SelectDevice(n);
                }
                if (is_selected) ImGui::SetItemDefaultFocus();
            }
            ImGui::EndCombo();
        }
        
        ImGui::Combo("##Codec", &codecIndex, codecItems, IM_ARRAYSIZE(codecItems));
        ImGui::Combo("##Bitrate", &bitrateIndex, bitrateItems, IM_ARRAYSIZE(bitrateItems));
        ImGui::PopItemWidth();
        
        ImGui::Spacing();
        
        float peakLeft = AudioEngine::GetPeakLevel(0);
        float peakRight = AudioEngine::GetPeakLevel(1);
        ImGui::TextColored(ImVec4(0.6f, 0.6f, 0.6f, 1.0f), "Vumetro (L/R)");
        ImGui::ProgressBar(peakLeft, ImVec2(-1, 12), "");
        ImGui::ProgressBar(peakRight, ImVec2(-1, 12), "");

        ImGui::Spacing();
        ImGui::Separator();
        ImGui::Spacing();

        if (isStreaming) {
            ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.8f, 0.1f, 0.1f, 1.0f));
            ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.9f, 0.2f, 0.2f, 1.0f));
            if (ImGui::Button("DETENER TRANSMISION", ImVec2(-1.0f, 60.0f))) {
                isStreaming = false;
                Metadata::StopWatcher();
                AudioEngine::StopCapture();
                Encoder::Disconnect();
            }
            ImGui::PopStyleColor(2);
            ImGui::TextColored(ImVec4(0.0f, 1.0f, 0.0f, 1.0f), "ESTADO: En vivo");
        } else {
            ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.1f, 0.6f, 0.2f, 1.0f));
            ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.2f, 0.7f, 0.3f, 1.0f));
            if (ImGui::Button("INICIAR TRANSMISION", ImVec2(-1.0f, 60.0f))) {
                if (AudioEngine::StartCapture()) {
                    isStreaming = true;
                    Encoder::Connect(serverUrl, port, mountPoint, password, AudioEngine::GetSampleRate());
                    Metadata::StartWatcher(metadataPath, serverUrl, port, mountPoint, password);
                }
            }
            ImGui::PopStyleColor(2);
            ImGui::TextColored(ImVec4(0.5f, 0.5f, 0.5f, 1.0f), "ESTADO: Desconectado");
        }

        ImGui::End();
    }

}
