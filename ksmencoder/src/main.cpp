#include <SDL.h>
#include <SDL_syswm.h>
#include "imgui.h"
#include "imgui_impl_sdl2.h"
#include "imgui_impl_sdlrenderer2.h"
#include <iostream>

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>

#include "gui.h"
#include "audio.h"

HWND g_hwnd = NULL;
NOTIFYICONDATA nid = {0};
#define WM_TRAYICON (WM_USER + 1)

int EventFilter(void* userdata, SDL_Event* event) {
    if (event->type == SDL_SYSWMEVENT) {
        SDL_SysWMmsg* msg = event->syswm.msg;
        if (msg->subsystem == SDL_SYSWM_WINDOWS) {
            UINT uMsg = msg->msg.win.msg;
            if (uMsg == WM_TRAYICON) {
                if (msg->msg.win.lParam == WM_LBUTTONUP || msg->msg.win.lParam == WM_LBUTTONDBLCLK) {
                    if (g_hwnd) {
                        ShowWindow(g_hwnd, SW_RESTORE);
                        SetForegroundWindow(g_hwnd);
                    }
                }
                return 0; // Detener propagación
            }
        }
    }
    return 1;
}

// Entry point nativo de Windows
int main(int argc, char* argv[])
{
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER | SDL_INIT_GAMECONTROLLER) != 0)
    {
        printf("Error: %s\n", SDL_GetError());
        return -1;
    }

    SDL_WindowFlags window_flags = (SDL_WindowFlags)(SDL_WINDOW_ALLOW_HIGHDPI);
    SDL_Window* window = SDL_CreateWindow("KSMEncoder", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 360, 560, window_flags);
    SDL_Renderer* renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_PRESENTVSYNC | SDL_RENDERER_ACCELERATED);
    
    if (renderer == nullptr)
    {
        SDL_Log("Error creating SDL_Renderer!");
        return -1;
    }

    // Obtener el HWND nativo para la bandeja del sistema
    SDL_SysWMinfo wmInfo;
    SDL_VERSION(&wmInfo.version);
    if (SDL_GetWindowWMInfo(window, &wmInfo)) {
        g_hwnd = wmInfo.info.win.window;
        
        ZeroMemory(&nid, sizeof(nid));
        nid.cbSize = sizeof(NOTIFYICONDATA);
        nid.hWnd = g_hwnd;
        nid.uID = 1001;
        nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
        nid.uCallbackMessage = WM_TRAYICON;
        nid.hIcon = LoadIcon(NULL, IDI_APPLICATION); // Ícono de app genérico
        lstrcpy(nid.szTip, "KSMEncoder");
        Shell_NotifyIcon(NIM_ADD, &nid);

        SDL_EventState(SDL_SYSWMEVENT, SDL_ENABLE);
        SDL_SetEventFilter(EventFilter, NULL);
    }

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO(); (void)io;
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;

    ImGui::StyleColorsDark();

    ImGui_ImplSDL2_InitForSDLRenderer(window, renderer);
    ImGui_ImplSDLRenderer2_Init(renderer);

    AudioEngine::Initialize();

    bool done = false;
    while (!done)
    {
        SDL_Event event;
        while (SDL_PollEvent(&event))
        {
            ImGui_ImplSDL2_ProcessEvent(&event);
            if (event.type == SDL_QUIT)
                done = true;
            if (event.type == SDL_WINDOWEVENT && event.window.event == SDL_WINDOWEVENT_CLOSE && event.window.windowID == SDL_GetWindowID(window))
                done = true;
        }

        ImGui_ImplSDLRenderer2_NewFrame();
        ImGui_ImplSDL2_NewFrame();
        ImGui::NewFrame();

        GUI::Render();

        ImGui::Render();
        SDL_RenderSetScale(renderer, io.DisplayFramebufferScale.x, io.DisplayFramebufferScale.y);
        SDL_SetRenderDrawColor(renderer, (Uint8)(0), (Uint8)(0), (Uint8)(0), (Uint8)(255));
        SDL_RenderClear(renderer);
        ImGui_ImplSDLRenderer2_RenderDrawData(ImGui::GetDrawData(), renderer);
        SDL_RenderPresent(renderer);
    }

    AudioEngine::Shutdown();
    
    if (g_hwnd) {
        Shell_NotifyIcon(NIM_DELETE, &nid);
    }

    ImGui_ImplSDLRenderer2_Shutdown();
    ImGui_ImplSDL2_Shutdown();
    ImGui::DestroyContext();

    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();

    return 0;
}
