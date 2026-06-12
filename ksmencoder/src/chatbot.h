#pragma once
#include <string>
#include <vector>
#include <functional>
#include <mutex>

namespace Chatbot {

    struct Message {
        std::string role; // "user" o "model"
        std::string text;
    };

    // Inicializa el sistema del bot
    void Initialize();
    
    // Libera recursos y cierra hilos
    void Shutdown();
    
    // Procesa el mensaje ingresado por el usuario en la interfaz de chat
    void SendUserMessage(const std::string& text);
    
    // Obtiene el historial de mensajes de forma segura (thread-safe)
    std::vector<Message> GetHistory();

    // Comprueba si la API key ya está configurada
    bool HasApiKey();
    
    // Devuelve verdadero si el bot está procesando una petición actualmente
    bool IsThinking();
}
