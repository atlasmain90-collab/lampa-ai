(function () {
  "use strict";

  if (window.plugin_ai_assistant) return;

  var STORAGE_KEY = "ai_assistant_config";
  var DEFAULT_CONFIG = {
    provider: "gemini",
    api_key: "",
    temperature: 0.7,
    max_tokens: 1024,
    custom_endpoints: {}
  };

  var PROVIDERS = {
    gemini: {
      name: "Google Gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
      buildBody: function (prompt, config) {
        return JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: config.temperature || 0.7,
            maxOutputTokens: config.max_tokens || 1024
          }
        });
      },
      parseResponse: function (data) {
        return data.candidates && data.candidates[0] && data.candidates[0].content
          ? data.candidates[0].content.parts[0].text
          : "Нет ответа";
      },
      headers: function (config) {
        return { "Content-Type": "application/json" };
      },
      buildUrl: function (config) {
        return this.url + "?key=" + config.api_key;
      }
    },
    openai: {
      name: "OpenAI (ChatGPT)",
      url: "https://api.openai.com/v1/chat/completions",
      buildBody: function (prompt, config) {
        return JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: config.temperature || 0.7,
          max_tokens: config.max_tokens || 1024
        });
      },
      parseResponse: function (data) {
        return data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : "Нет ответа";
      },
      headers: function (config) {
        return {
          "Content-Type": "application/json",
          Authorization: "Bearer " + config.api_key
        };
      },
      buildUrl: function (config) {
        return this.url;
      }
    },
    anthropic: {
      name: "Anthropic (Claude)",
      url: "https://api.anthropic.com/v1/messages",
      buildBody: function (prompt, config) {
        return JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: config.max_tokens || 1024,
          messages: [{ role: "user", content: prompt }]
        });
      },
      parseResponse: function (data) {
        return data.content && data.content[0] ? data.content[0].text : "Нет ответа";
      },
      headers: function (config) {
        return {
          "Content-Type": "application/json",
          "x-api-key": config.api_key,
          "anthropic-version": "2023-06-01"
        };
      },
      buildUrl: function (config) {
        return this.url;
      }
    },
    groq: {
      name: "Groq (Llama/Mixtral)",
      url: "https://api.groq.com/openai/v1/chat/completions",
      buildBody: function (prompt, config) {
        return JSON.stringify({
          model: "llama3-70b-8192",
          messages: [{ role: "user", content: prompt }],
          temperature: config.temperature || 0.7,
          max_tokens: config.max_tokens || 1024
        });
      },
      parseResponse: function (data) {
        return data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : "Нет ответа";
      },
      headers: function (config) {
        return {
          "Content-Type": "application/json",
          Authorization: "Bearer " + config.api_key
        };
      },
      buildUrl: function (config) {
        return this.url;
      }
    }
  };

  var SYSTEM_PROMPT =
    "Ты — AI-ассистент для приложения Lampa (кинотеатр). " +
    "Отвечай кратко и по делу на русском языке. " +
    "Помогай с подбором фильмов, описывай сюжеты, рекомендации, информацию о актёрах и режиссёрах.";

  function getConfig() {
    var stored = Lampa.Storage.get(STORAGE_KEY);
    if (!stored || typeof stored !== "object") return Object.assign({}, DEFAULT_CONFIG);
    return Object.assign({}, DEFAULT_CONFIG, stored);
  }

  function saveConfig(cfg) {
    Lampa.Storage.set(STORAGE_KEY, cfg);
  }

  function askAI(prompt, callback) {
    var config = getConfig();
    var provider = PROVIDERS[config.provider];
    if (!provider) return callback("Провайдер не выбран");
    if (!config.api_key) return callback("Введите API-ключ в настройках плагина");

    var fullPrompt = SYSTEM_PROMPT + "\n\nПользователь: " + prompt;

    $.ajax({
      url: provider.buildUrl(config),
      type: "POST",
      headers: provider.headers(config),
      data: provider.buildBody(fullPrompt, config),
      contentType: "application/json",
      dataType: "json",
      timeout: 30000,
      success: function (data) {
        try {
          var text = provider.parseResponse(data);
          callback(null, text);
        } catch (e) {
          callback("Ошибка парсинга ответа: " + e.message);
        }
      },
      error: function (xhr) {
        var msg = "Ошибка запроса";
        if (xhr.responseJSON && xhr.responseJSON.error) {
          msg = xhr.responseJSON.error.message || msg;
        } else if (xhr.statusText) {
          msg = xhr.statusText;
        }
        callback(msg);
      }
    });
  }

  // ===== Custom DOM: AI Chat Panel =====

  function createChatPanel() {
    if ($("#ai-assistant-panel").length) {
      $("#ai-assistant-panel").toggle();
      return;
    }

    var panel = $(
      '<div id="ai-assistant-panel" style="' +
        "position:fixed;right:20px;bottom:80px;width:400px;max-height:550px;" +
        "background:#1a1a2e;border:1px solid #e94560;border-radius:12px;" +
        "display:flex;flex-direction:column;z-index:99999;" +
        "box-shadow:0 8px 32px rgba(233,69,96,0.3);font-family:Arial,sans-serif;" +
      '">' +
        // Header
        '<div id="ai-panel-header" style="' +
          "background:#16213e;padding:12px 16px;border-radius:12px 12px 0 0;" +
          "display:flex;justify-content:space-between;align-items:center;cursor:move;" +
        '">' +
          '<span style="color:#e94560;font-weight:bold;font-size:14px;">AI Ассистент</span>' +
          '<div>' +
            '<span id="ai-settings-btn" style="color:#aaa;cursor:pointer;margin-right:10px;font-size:18px;" title="Настройки">&#9881;</span>' +
            '<span id="ai-close-btn" style="color:#aaa;cursor:pointer;font-size:18px;" title="Закрыть">&#10005;</span>' +
          '</div>' +
        '</div>' +
        // Messages area
        '<div id="ai-messages" style="' +
          "flex:1;overflow-y:auto;padding:12px;max-height:380px;min-height:200px;" +
          "scroll-behavior:smooth;" +
        '">' +
          '<div style="color:#888;text-align:center;padding:20px;">Задайте вопрос о фильмах, сериалах, актёрах...</div>' +
        '</div>' +
        // Input area
        '<div style="padding:10px 12px;border-top:1px solid #333;display:flex;gap:8px;">' +
          '<input id="ai-input" type="text" placeholder="Введите сообщение..." style="' +
            "flex:1;background:#0f3460;border:1px solid #e94560;border-radius:8px;" +
            "padding:10px 12px;color:#fff;font-size:13px;outline:none;" +
          '" />' +
          '<button id="ai-send-btn" style="' +
            "background:#e94560;border:none;border-radius:8px;padding:10px 16px;" +
            "color:#fff;font-weight:bold;cursor:pointer;font-size:13px;" +
          '">Отправить</button>' +
        '</div>' +
      '</div>'
    );

    $("body").append(panel);

    // Drag functionality
    var isDragging = false;
    var dragOffset = { x: 0, y: 0 };
    var header = panel.find("#ai-panel-header");

    header.on("mousedown", function (e) {
      isDragging = true;
      var rect = panel[0].getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      e.preventDefault();
    });

    $(document).on("mousemove.ai_drag", function (e) {
      if (!isDragging) return;
      panel.css({
        left: e.clientX - dragOffset.x + "px",
        top: e.clientY - dragOffset.y + "px",
        right: "auto",
        bottom: "auto"
      });
    });

    $(document).on("mouseup.ai_drag", function () {
      isDragging = false;
    });

    // Close button
    panel.find("#ai-close-btn").on("click", function () {
      panel.hide();
    });

    // Settings button
    panel.find("#ai-settings-btn").on("click", function () {
      showSettingsDialog();
    });

    // Send message
    panel.find("#ai-send-btn").on("click", function () {
      sendFromPanel();
    });

    panel.find("#ai-input").on("keydown", function (e) {
      if (e.key === "Enter") sendFromPanel();
    });
  }

  function sendFromPanel() {
    var input = $("#ai-input");
    var text = input.val().trim();
    if (!text) return;
    input.val("");
    addMessageToPanel("user", text);
    addMessageToPanel("loading", "Думаю...");
    askAI(text, function (err, response) {
      $("#ai-messages .ai-msg-loading").remove();
      if (err) {
        addMessageToPanel("error", "Ошибка: " + err);
      } else {
        addMessageToPanel("assistant", response);
      }
    });
  }

  function addMessageToPanel(role, text) {
    var messages = $("#ai-messages");
    // Remove placeholder
    messages.find("div:contains('Задайте вопрос')").remove();

    var isUser = role === "user";
    var isLoading = role === "loading";
    var isError = role === "error";

    var bgColor = isUser ? "#e94560" : isError ? "#c0392b" : "#16213e";
    var align = isUser ? "right" : "left";
    var color = "#fff";
    var cssClass = isLoading ? "ai-msg-loading" : "";

    var msg = $(
      '<div class="' + cssClass + '" style="' +
        "margin-bottom:10px;text-align:" + align + ";" +
      '">' +
        '<div style="' +
          "display:inline-block;background:" + bgColor + ";color:" + color + ";" +
          "padding:10px 14px;border-radius:12px;max-width:85%;text-align:left;" +
          "font-size:13px;line-height:1.4;word-wrap:break-word;white-space:pre-wrap;" +
        '">' +
          text +
        '</div>' +
      '</div>'
    );

    messages.append(msg);
    messages.scrollTop(messages[0].scrollHeight);
  }

  // ===== Settings Dialog =====

  function showSettingsDialog() {
    if ($("#ai-settings-dialog").length) {
      $("#ai-settings-dialog").toggle();
      return;
    }

    var config = getConfig();
    var providerOptions = "";
    Object.keys(PROVIDERS).forEach(function (key) {
      var selected = key === config.provider ? " selected" : "";
      providerOptions += '<option value="' + key + '"' + selected + ">" + PROVIDERS[key].name + "</option>";
    });

    var dialog = $(
      '<div id="ai-settings-dialog" style="' +
        "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
        "width:420px;background:#1a1a2e;border:1px solid #e94560;border-radius:12px;" +
        "z-index:100000;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,0.7);" +
        "color:#fff;font-family:Arial,sans-serif;" +
      '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<h3 style="margin:0;color:#e94560;">Настройки AI Ассистента</h3>' +
          '<span id="ai-settings-close" style="cursor:pointer;font-size:20px;color:#aaa;">&#10005;</span>' +
        '</div>' +
        // Provider
        '<label style="display:block;margin-bottom:6px;font-size:13px;color:#aaa;">Провайдер</label>' +
        '<select id="ai-provider-select" style="' +
          "width:100%;padding:10px;border-radius:8px;border:1px solid #333;" +
          "background:#0f3460;color:#fff;margin-bottom:16px;font-size:13px;" +
        '">' + providerOptions + '</select>' +
        // API Key
        '<label style="display:block;margin-bottom:6px;font-size:13px;color:#aaa;">API-ключ</label>' +
        '<input id="ai-apikey-input" type="password" value="' + (config.api_key || "") + '" style="' +
          "width:100%;padding:10px;border-radius:8px;border:1px solid #333;" +
          "background:#0f3460;color:#fff;margin-bottom:16px;font-size:13px;box-sizing:border-box;" +
        '" placeholder="Вставьте API-ключ..." />' +
        // Temperature
        '<label style="display:block;margin-bottom:6px;font-size:13px;color:#aaa;">Temperature: <span id="ai-temp-val">' + config.temperature + '</span></label>' +
        '<input id="ai-temp-input" type="range" min="0" max="1" step="0.1" value="' + config.temperature + '" style="' +
          "width:100%;margin-bottom:16px;accent-color:#e94560;" +
        '" />' +
        // Max tokens
        '<label style="display:block;margin-bottom:6px;font-size:13px;color:#aaa;">Макс. токенов</label>' +
        '<input id="ai-tokens-input" type="number" min="100" max="4096" step="100" value="' + config.max_tokens + '" style="' +
          "width:100%;padding:10px;border-radius:8px;border:1px solid #333;" +
          "background:#0f3460;color:#fff;margin-bottom:20px;font-size:13px;box-sizing:border-box;" +
        '" />' +
        // Quick prompts
        '<div style="margin-bottom:16px;">' +
          '<label style="display:block;margin-bottom:8px;font-size:13px;color:#aaa;">Быстрые промпты</label>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
            '<button class="ai-quick-prompt" data-prompt="Рекомендуй 5 лучших фильмов 2024 года" style="background:#16213e;border:1px solid #e94560;color:#fff;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px;">Фильмы 2024</button>' +
            '<button class="ai-quick-prompt" data-prompt="Что сейчас смотрят и советуют?" style="background:#16213e;border:1px solid #e94560;color:#fff;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px;">Что посмотреть</button>' +
            '<button class="ai-quick-prompt" data-prompt="Объясни сюжет фильма Интерстеллар без спойлеров" style="background:#16213e;border:1px solid #e94560;color:#fff;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px;">Сюжет</button>' +
            '<button class="ai-quick-prompt" data-prompt="Найди похожие фильмы на Начало (Inception)" style="background:#16213e;border:1px solid #e94560;color:#fff;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px;">Похожие</button>' +
          '</div>' +
        '</div>' +
        // Save
        '<button id="ai-save-btn" style="' +
          "width:100%;padding:12px;background:#e94560;border:none;border-radius:8px;" +
          "color:#fff;font-weight:bold;font-size:14px;cursor:pointer;" +
        '">Сохранить</button>' +
      '</div>'
    );

    $("body").append(dialog);

    // Events
    dialog.find("#ai-settings-close").on("click", function () {
      dialog.hide();
    });

    dialog.find("#ai-temp-input").on("input", function () {
      dialog.find("#ai-temp-val").text(this.value);
    });

    dialog.find(".ai-quick-prompt").on("click", function () {
      var prompt = $(this).data("prompt");
      dialog.hide();
      createChatPanel();
      $("#ai-input").val(prompt);
      sendFromPanel();
    });

    dialog.find("#ai-save-btn").on("click", function () {
      var newConfig = {
        provider: dialog.find("#ai-provider-select").val(),
        api_key: dialog.find("#ai-apikey-input").val().trim(),
        temperature: parseFloat(dialog.find("#ai-temp-input").val()),
        max_tokens: parseInt(dialog.find("#ai-tokens-input").val(), 10)
      };
      saveConfig(newConfig);
      Lampa.Noty.show("Настройки AI сохранены");
      dialog.hide();
    });
  }

  // ===== Floating Button =====

  function addFloatingButton() {
    if ($("#ai-fab-btn").length) return;

    var fab = $(
      '<div id="ai-fab-btn" style="' +
        "position:fixed;right:24px;bottom:24px;width:52px;height:52px;" +
        "background:linear-gradient(135deg,#e94560,#0f3460);border-radius:50%;" +
        "display:flex;align-items:center;justify-content:center;cursor:pointer;" +
        "z-index:99998;box-shadow:0 4px 16px rgba(233,69,96,0.5);" +
        "transition:transform 0.2s;font-size:22px;color:#fff;" +
        "user-select:none;" +
      '" title="AI Ассистент">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="white"/>' +
        '</svg>' +
      '</div>'
    );

    fab.on("mouseenter", function () {
      $(this).css("transform", "scale(1.1)");
    });
    fab.on("mouseleave", function () {
      $(this).css("transform", "scale(1)");
    });
    fab.on("click", function () {
      createChatPanel();
    });

    $("body").append(fab);
  }

  // ===== Plugin Info Component =====

  function registerComponent() {
    function AiAssistantComponent(object) {
      this.create = function () {};
      this.build = function () {};
      this.start = function () {};
      this.pause = function () {};
      this.stop = function () {};
      this.render = function () {
        return $('<div style="padding:20px;color:#fff;"><h2>AI Ассистент</h2><p>Используйте кнопку в правом нижнем углу для общения с AI.</p></div>');
      };
      this.destroy = function () {};
    }

    Lampa.Component.add("ai_assistant", AiAssistantComponent);
  }

  // ===== Menu Item =====

  function addMenuItem() {
    var ico =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>' +
      '</svg>';

    var langKey = "ai_assistant_menu";
    Lampa.Lang.add({
      ai_assistant_menu: {
        ru: "AI Ассистент",
        en: "AI Assistant",
        uk: "AI Асистент"
      }
    });

    var item = $(
      '<li class="menu__item selector" data-action="ai_assistant">' +
        '<div class="menu__ico">' + ico + "</div>" +
        '<div class="menu__text">' + Lampa.Lang.translate(langKey) + "</div>" +
      '</li>'
    );

    item.on("hover:enter", function () {
      showSettingsDialog();
    });

    $(".menu .menu__list").eq(0).append(item);
  }

  // ===== Init =====

  function startPlugin() {
    window.plugin_ai_assistant = true;
    registerComponent();

    if (window.appready) {
      addMenuItem();
      addFloatingButton();
    } else {
      Lampa.Listener.follow("app", function (e) {
        if (e.type === "ready") {
          addMenuItem();
          addFloatingButton();
        }
      });
    }
  }

  startPlugin();
})();
