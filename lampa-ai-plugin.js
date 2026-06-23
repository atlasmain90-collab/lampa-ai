(function () {
  "use strict";

  if (window.plugin_ai_assistant) return;

  var STORAGE_KEY = "ai_assistant_config";

  var PROVIDERS = {
    gemini: {
      name: "Google Gemini",
      buildUrl: function (k) {
        return "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + k;
      },
      buildBody: function (p, c) {
        return JSON.stringify({ contents: [{ parts: [{ text: p }] }], generationConfig: { temperature: c.temperature, maxOutputTokens: c.max_tokens } });
      },
      parse: function (d) { return d.candidates && d.candidates[0] ? d.candidates[0].content.parts[0].text : ""; },
      headers: function () { return { "Content-Type": "application/json" }; }
    },
    openai: {
      name: "OpenAI",
      buildUrl: function () { return "https://api.openai.com/v1/chat/completions"; },
      buildBody: function (p, c) {
        return JSON.stringify({ model: "gpt-3.5-turbo", messages: [{ role: "user", content: p }], temperature: c.temperature, max_tokens: c.max_tokens });
      },
      parse: function (d) { return d.choices && d.choices[0] ? d.choices[0].message.content : ""; },
      headers: function (k) { return { "Content-Type": "application/json", Authorization: "Bearer " + k }; }
    },
    groq: {
      name: "Groq (Llama)",
      buildUrl: function () { return "https://api.groq.com/openai/v1/chat/completions"; },
      buildBody: function (p, c) {
        return JSON.stringify({ model: "llama3-70b-8192", messages: [{ role: "user", content: p }], temperature: c.temperature, max_tokens: c.max_tokens });
      },
      parse: function (d) { return d.choices && d.choices[0] ? d.choices[0].message.content : ""; },
      headers: function (k) { return { "Content-Type": "application/json", Authorization: "Bearer " + k }; }
    },
    anthropic: {
      name: "Claude",
      buildUrl: function () { return "https://api.anthropic.com/v1/messages"; },
      buildBody: function (p, c) {
        return JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: c.max_tokens, messages: [{ role: "user", content: p }] });
      },
      parse: function (d) { return d.content && d.content[0] ? d.content[0].text : ""; },
      headers: function (k) { return { "Content-Type": "application/json", "x-api-key": k, "anthropic-version": "2023-06-01" }; }
    }
  };

  var SYS_PROMPT = "Ты — AI-ассистент для кинотеатра Lampa. Отвечай кратко на русском. Помогай с фильмами, сериалами, актёрами, рекомендациями.";

  function cfg() {
    var s = Lampa.Storage.get(STORAGE_KEY);
    return s && typeof s === "object" ? s : { provider: "gemini", api_key: "", temperature: 0.7, max_tokens: 1024 };
  }

  function saveCfg(c) { Lampa.Storage.set(STORAGE_KEY, c); }

  function askAI(prompt, cb) {
    var c = cfg();
    var p = PROVIDERS[c.provider];
    if (!p) return cb("Провайдер не выбран");
    if (!c.api_key) return cb("Введите API-ключ");

    $.ajax({
      url: p.buildUrl(c.api_key),
      type: "POST",
      headers: p.headers(c.api_key),
      data: p.buildBody(SYS_PROMPT + "\n\nПользователь: " + prompt, c),
      contentType: "application/json",
      dataType: "json",
      timeout: 30000,
      success: function (d) { try { cb(null, p.parse(d)); } catch (e) { cb("Ошибка ответа"); } },
      error: function (x) { cb(x.responseJSON && x.responseJSON.error ? x.responseJSON.error.message : "Ошибка запроса"); }
    });
  }

  function AiComponent() {
    this.create = function () {};
    this.build = function () {};
    this.start = function () {};
    this.pause = function () {};
    this.stop = function () {};
    this.destroy = function () {};

    this.render = function () {
      var el = $('<div class="ai-assistant-page"></div>');
      var c = cfg();

      el.html(
        '<div style="padding:2em;">' +
          '<div style="display:flex;align-items:center;gap:1em;margin-bottom:1.5em;">' +
            '<svg width="32" height="32" viewBox="0 0 24 24" fill="#e94560"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>' +
            '<h2 style="margin:0;color:#fff;">AI Ассистент</h2>' +
          '</div>' +
          '<div class="ai-chat-messages" style="' +
            'background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:1em;' +
            'min-height:300px;max-height:400px;overflow-y:auto;margin-bottom:1em;color:#fff;' +
          '">' +
            '<div style="color:#666;text-align:center;padding:2em;">Задайте вопрос о фильмах, сериалах, актёрах...</div>' +
          '</div>' +
          '<div style="display:flex;gap:0.5em;">' +
            '<input class="ai-chat-input" type="text" placeholder="Введите сообщение..." style="' +
              'flex:1;background:#0f3460;border:1px solid #e94560;border-radius:6px;' +
              'padding:0.8em 1em;color:#fff;font-size:1em;outline:none;' +
            '" />' +
            '<button class="ai-chat-send selector" style="' +
              'background:#e94560;border:none;border-radius:6px;padding:0.8em 1.5em;' +
              'color:#fff;font-weight:bold;cursor:pointer;font-size:1em;' +
            '">→</button>' +
          '</div>' +
        '</div>'
      );

      el.find(".ai-chat-send").on("hover:enter", function () {
        var input = el.find(".ai-chat-input");
        var text = input.val().trim();
        if (!text) return;
        input.val("");
        addMsg(el, "user", text);
        addMsg(el, "loading", "Думаю...");
        askAI(text, function (err, res) {
          el.find(".ai-msg-loading").remove();
          addMsg(el, err ? "error" : "ai", err || res);
        });
      });

      el.find(".ai-chat-input").on("keydown", function (e) {
        if (e.key === "Enter") el.find(".ai-chat-send").trigger("hover:enter");
      });

      return el;
    };
  }

  function addMsg(el, role, text) {
    var msgs = el.find(".ai-chat-messages");
    msgs.find("div:contains('Задайте вопрос')").remove();

    var isUser = role === "user";
    var isLoading = role === "loading";
    var isError = role === "error";

    var bg = isUser ? "#e94560" : isError ? "#c0392b" : "#16213e";
    var align = isUser ? "text-align:right" : "text-align:left";

    var msg = $(
      '<div class="' + (isLoading ? "ai-msg-loading" : "") + '" style="margin-bottom:0.8em;' + align + ';">' +
        '<div style="display:inline-block;background:' + bg + ';color:#fff;' +
          'padding:0.7em 1em;border-radius:12px;max-width:85%;' +
          'font-size:0.95em;line-height:1.5;word-wrap:break-word;white-space:pre-wrap;text-align:left;">' +
          text +
        '</div>' +
      '</div>'
    );

    msgs.append(msg);
    msgs.scrollTop(msgs[0].scrollHeight);
  }

  function addSettingsPage() {
    var c = cfg();
    var opts = "";
    Object.keys(PROVIDERS).forEach(function (k) {
      opts += '<option value="' + k + '"' + (k === c.provider ? " selected" : "") + ">" + PROVIDERS[k].name + "</option>";
    });

    Lampa.SettingsApi.addComponent({
      component: "ai_assistant",
      name: "AI Ассистент",
      icon: '<svg height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>'
    });

    Lampa.SettingsApi.addParam({
      component: "ai_assistant",
      param: { name: "ai_provider", type: "select", values: { gemini: "Google Gemini", openai: "OpenAI", groq: "Groq (Llama)", anthropic: "Claude" }, default: c.provider },
      field: { name: "Провайдер" },
      onChange: function (v) { var x = cfg(); x.provider = v; saveCfg(x); }
    });

    Lampa.SettingsApi.addParam({
      component: "ai_assistant",
      param: { name: "ai_apikey", type: "input", default: c.api_key },
      field: { name: "API-ключ", description: "Ключ от выбранного провайдера" },
      onChange: function (v) { var x = cfg(); x.api_key = v; saveCfg(x); }
    });

    Lampa.SettingsApi.addParam({
      component: "ai_assistant",
      param: { name: "ai_temp", type: "select", values: { 0: "0", "0.3": "0.3", "0.5": "0.5", "0.7": "0.7", "1": "1" }, default: String(c.temperature) },
      field: { name: "Temperature" },
      onChange: function (v) { var x = cfg(); x.temperature = parseFloat(v); saveCfg(x); }
    });

    Lampa.SettingsApi.addParam({
      component: "ai_assistant",
      param: { name: "ai_tokens", type: "select", values: { 256: "256", 512: "512", 1024: "1024", 2048: "2048" }, default: String(c.max_tokens) },
      field: { name: "Макс. токенов" },
      onChange: function (v) { var x = cfg(); x.max_tokens = parseInt(v); saveCfg(x); }
    });
  }

  function addMenu() {
    var ico =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';

    var item = $(
      '<li class="menu__item selector" data-action="ai_assistant">' +
        '<div class="menu__ico">' + ico + "</div>" +
        '<div class="menu__text">AI Ассистент</div>' +
      '</li>'
    );

    item.on("hover:enter", function () {
      Lampa.Activity.push({
        url: "?component=ai_assistant",
        title: "AI Ассистент",
        component: "ai_assistant"
      });
    });

    $(".menu .menu__list").eq(0).append(item);
  }

  function startPlugin() {
    window.plugin_ai_assistant = true;
    Lampa.Component.add("ai_assistant", AiComponent);
    addSettingsPage();

    if (window.appready) {
      addMenu();
    } else {
      Lampa.Listener.follow("app", function (e) {
        if (e.type === "ready") addMenu();
      });
    }
  }

  startPlugin();
})();
