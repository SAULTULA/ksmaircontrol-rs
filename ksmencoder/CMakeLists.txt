cmake_minimum_required(VERSION 3.14)
project(KSMEncoder VERSION 1.0.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

# Descargar SDL2
FetchContent_Declare(
    SDL2
    GIT_REPOSITORY https://github.com/libsdl-org/SDL.git
    GIT_TAG release-2.30.0
)
set(SDL_SHARED OFF CACHE BOOL "Build a shared version of the library")
set(SDL_STATIC ON CACHE BOOL "Build a static version of the library")
FetchContent_MakeAvailable(SDL2)

# Descargar Dear ImGui
FetchContent_Declare(
    imgui
    GIT_REPOSITORY https://github.com/ocornut/imgui.git
    GIT_TAG docking
)
FetchContent_MakeAvailable(imgui)

# Descargar nlohmann/json
FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(nlohmann_json)

# Crear librería ImGui
add_library(imgui_lib STATIC
    ${imgui_SOURCE_DIR}/imgui.cpp
    ${imgui_SOURCE_DIR}/imgui_demo.cpp
    ${imgui_SOURCE_DIR}/imgui_draw.cpp
    ${imgui_SOURCE_DIR}/imgui_tables.cpp
    ${imgui_SOURCE_DIR}/imgui_widgets.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_sdl2.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_sdlrenderer2.cpp
)
target_include_directories(imgui_lib PUBLIC 
    ${imgui_SOURCE_DIR} 
    ${imgui_SOURCE_DIR}/backends
)
target_link_libraries(imgui_lib PUBLIC SDL2-static)

# Ejecutable KSM Encoder (Añadimos WIN32 para ocultar la consola)
add_executable(KSMEncoder WIN32
    src/main.cpp
    src/gui.cpp
    src/audio.cpp
    src/encoder.cpp
    src/metadata.cpp
    src/chatbot.cpp
)

target_include_directories(KSMEncoder PRIVATE src)
# Aseguramos linkear SDL2main también por si el compilador lo exige
target_link_libraries(KSMEncoder PRIVATE imgui_lib SDL2main SDL2-static nlohmann_json::nlohmann_json)

# Librerías nativas de Windows para Audio (WASAPI) y Red (Winsock)
target_link_libraries(KSMEncoder PRIVATE 
    ole32 
    avrt 
    ws2_32 
    winmm
    setupapi
    version
    imm32
    ksuser
    mfplat
    mfuuid
    msacm32
    winhttp
    shell32
    comdlg32
)
