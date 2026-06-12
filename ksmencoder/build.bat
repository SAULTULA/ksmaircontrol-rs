@echo off
echo Compilando KSM Encoder...
if not exist build mkdir build
cd build
if not exist CMakeCache.txt (
    echo Configurando CMake por primera vez...
    cmake -A Win32 ..
)
cmake --build . --config Release
echo.
echo Proceso terminado.
pause
