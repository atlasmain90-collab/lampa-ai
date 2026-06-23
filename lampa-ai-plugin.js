(function () {
  'use strict';

  if (window.plugin_ai_assistant) return;
  window.plugin_ai_assistant = true;

  var STORAGE_KEY = 'ai_assistant_config';

  var AI_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>';

  var PROVIDERS = {
    gemini: {
      name: 'Google Gemini',
      buildUrl: function (k) { return 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + k; },
      buildBody: function (p, c) { return JSON.stringify({ contents: [{ parts: [{ text: p }] }], generationConfig: { temperature: c.temperature, maxOutputTokens: c.max_tokens } }); },
      parse: function (d) { return d.candidates && d.candidates[0] ? d.candidates[0].content.parts[0].text : ''; },
      headers: function () { return { 'Content-Type': 'application/json' }; }
    },
    openai: {
      name: 'OpenAI',
      buildUrl: function () { return 'https://api.openai.com/v1/chat/completions'; },
      buildBody: function (p, c) { return JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: p }], temperature: c.temperature, max_tokens: c.max_tokens }); },
      parse: function (d) { return d.choices && d.choices[0] ? d.choices[0].message.content : ''; },
      headers: function (k) { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }; }
    },
    groq: {
      name: 'Groq (Llama)',
      buildUrl: function () { return 'https://api.groq.com/openai/v1/chat/completions'; },
      buildBody: function (p, c) { return JSON.stringify({ model: 'llama3-70b-8192', messages: [{ role: 'user', content: p }], temperature: c.temperature, max_tokens: c.max_tokens }); },
      parse: function (d) { return d.choices && d.choices[0] ? d.choices[0].message.content : ''; },
      headers: function (k) { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }; }
    },
    anthropic: {
      name: 'Claude',
      buildUrl: function () { return 'https://api.anthropic.com/v1/messages'; },
      buildBody: function (p, c) { return JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: c.max_tokens, messages: [{ role: 'user', content: p }] }); },
      parse: function (d) { return d.content && d.content[0] ? d.content[0].text : ''; },
      headers: function (k) { return { 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' }; }
    }
  };

  var SYS = 'Ты — AI-ассистент для кинотеатра Lampa. Отвечай кратко на русском. Помогай с фильмами, сериалами, актёрами, рекомендациями.';

  function gc() {
    var s = Lampa.Storage.get(STORAGE_KEY);
    return s && typeof s === 'object' ? s : { provider: 'gemini', api_key: '', temperature: 0.7, max_tokens: 1024 };
  }

  function sc(c) { Lampa.Storage.set(STORAGE_KEY, c); }

  function askAI(prompt, cb) {
    var c = gc();
    var pr = PROVIDERS[c.provider];
    if (!pr) return cb('Провайдер не выбран');
    if (!c.api_key) return cb('Введите API-ключ');

    $.ajax({
      url: pr.buildUrl(c.api_key),
      type: 'POST',
      headers: pr.headers(c.api_key),
      data: pr.buildBody(SYS + '\n\nПользователь: ' + prompt, c),
      contentType: 'application/json',
      dataType: 'json',
      timeout: 30000,
      success: function (d) { try { cb(null, pr.parse(d)); } catch (e) { cb('Ошибка ответа'); } },
      error: function (x) { cb(x.responseJSON && x.responseJSON.error ? x.responseJSON.error.message : 'Ошибка запроса'); }
    });
  }

  function addMsg(el, role, text) {
    var msgs = el.find('.ai-chat-messages');
    msgs.find('.ai-placeholder').remove();

    var isUser = role === 'user';
    var isLoading = role === 'loading';
    var isError = role === 'error';

    var bg = isUser ? '#e94560' : isError ? '#c0392b' : '#16213e';
    var align = isUser ? 'text-align:right' : 'text-align:left';

    var msg = $(
      '<div class="' + (isLoading ? 'ai-msg-loading' : '') + '" style="margin-bottom:0.8em;' + align + ';">' +
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

  function openAI() {
    Lampa.Activity.push({
      url: '?component=ai_assistant',
      title: 'AI Ассистент',
      component: 'ai_assistant'
    });
  }

  // ====== COMPONENT ======

  function AiComponent() {
    var html = $('<div></div>');
    var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
    var body = $('<div style="padding:1.5em;"></div>');

    this.create = function () {
      this.activity.loader(true);

      body.html(
        '<div style="display:flex;align-items:center;gap:0.8em;margin-bottom:1.5em;">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="#e94560"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' +
          '<h2 style="margin:0;color:#fff;">AI Ассистент</h2>' +
        '</div>' +
        '<div class="ai-chat-messages" style="' +
          'background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:1em;' +
          'min-height:300px;max-height:400px;overflow-y:auto;margin-bottom:1em;color:#fff;' +
        '">' +
          '<div class="ai-placeholder" style="color:#666;text-align:center;padding:2em;">Задайте вопрос о фильмах, сериалах, актёрах...</div>' +
        '</div>' +
        '<div style="display:flex;gap:0.5em;">' +
          '<input class="ai-chat-input" type="text" placeholder="Введите сообщение..." style="' +
            'flex:1;background:#0f3460;border:1px solid #e94560;border-radius:6px;' +
            'padding:0.8em 1em;color:#fff;font-size:1em;outline:none;' +
          '" />' +
          '<div class="ai-chat-send selector" style="' +
            'background:#e94560;border:none;border-radius:6px;padding:0.8em 1.5em;' +
            'color:#fff;font-weight:bold;cursor:pointer;font-size:1em;' +
          '">Отправить</div>' +
        '</div>'
      );

      scroll.append(body);
      html.append(scroll.render());

      this.activity.loader(false);
      this.activity.toggle();

      return this.render();
    };

    this.render = function () { return html; };

    this.start = function () {
      if (Lampa.Activity.active().activity !== this.activity) return;

      Lampa.Controller.add('ai_content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render());
          Lampa.Controller.collectionFocus(false, scroll.render());
        },
        left: function () {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        right: function () { Navigator.move('right'); },
        up: function () {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function () { Navigator.move('down'); },
        back: function () { Lampa.Activity.backward(); }
      });

      Lampa.Controller.toggle('ai_content');

      setTimeout(function () {
        body.find('.ai-chat-send').on('hover:enter', function () {
          var input = body.find('.ai-chat-input');
          var text = input.val().trim();
          if (!text) return;
          input.val('');
          addMsg(body, 'user', text);
          addMsg(body, 'loading', 'Думаю...');
          askAI(text, function (err, res) {
            body.find('.ai-msg-loading').remove();
            addMsg(body, err ? 'error' : 'ai', err || res);
          });
        });

        body.find('.ai-chat-input').on('keydown', function (e) {
          if (e.key === 'Enter') body.find('.ai-chat-send').trigger('hover:enter');
        });
      }, 200);
    };

    this.pause = function () {};
    this.stop = function () {};
    this.destroy = function () {
      scroll.destroy();
      html.remove();
    };
  }

  // ====== SETTINGS ======

  function addSettings() {
    var c = gc();

    Lampa.SettingsApi.addComponent({
      component: 'ai_assistant',
      name: 'AI Ассистент',
      icon: AI_SVG
    });

    Lampa.SettingsApi.addParam({
      component: 'ai_assistant',
      param: { name: 'ai_provider', type: 'select', values: { gemini: 'Google Gemini', openai: 'OpenAI', groq: 'Groq (Llama)', anthropic: 'Claude' }, default: c.provider },
      field: { name: 'Провайдер' },
      onChange: function (v) { var x = gc(); x.provider = v; sc(x); }
    });

    Lampa.SettingsApi.addParam({
      component: 'ai_assistant',
      param: { name: 'ai_apikey', type: 'input', default: c.api_key },
      field: { name: 'API-ключ', description: 'Ключ от выбранного провайдера' },
      onChange: function (v) { var x = gc(); x.api_key = v; sc(x); }
    });

    Lampa.SettingsApi.addParam({
      component: 'ai_assistant',
      param: { name: 'ai_temp', type: 'select', values: { 0: '0', 0.3: '0.3', 0.5: '0.5', 0.7: '0.7', 1: '1' }, default: String(c.temperature) },
      field: { name: 'Temperature' },
      onChange: function (v) { var x = gc(); x.temperature = parseFloat(v); sc(x); }
    });

    Lampa.SettingsApi.addParam({
      component: 'ai_assistant',
      param: { name: 'ai_tokens', type: 'select', values: { 256: '256', 512: '512', 1024: '1024', 2048: '2048' }, default: String(c.max_tokens) },
      field: { name: 'Макс. токенов' },
      onChange: function (v) { var x = gc(); x.max_tokens = parseInt(v); sc(x); }
    });

    // Кнопка "Открыть AI чат" прямо в настройках
    Lampa.SettingsApi.addParam({
      component: 'ai_assistant',
      param: { type: 'button' },
      field: { name: 'Открыть AI чат', description: 'Запустить AI-ассистент' },
      onChange: function () {
        openAI();
      }
    });

    // Кнопка-ссылка в разделе "Интерфейс" — гарантированно видна
    Lampa.SettingsApi.addParam({
      component: 'interface',
      param: { type: 'button' },
      field: { name: 'AI Ассистент', description: 'Настройки и чат с нейросетью' },
      onChange: function () {
        Lampa.Settings.create('ai_assistant', {
          onBack: function () {
            Lampa.Settings.create('interface');
          }
        });
      }
    });
  }

  // ====== INIT — setInterval ждёт DOM ======

  Lampa.Component.add('ai_assistant', AiComponent);
  addSettings();

  var menuAdded = false;
  var headAdded = false;

  var interval = setInterval(function () {
    // Ищем меню
    if (!menuAdded) {
      var menu = $('.menu .menu__list');
      if (menu.length) {
        menuAdded = true;
        var item = $(
          '<li class="menu__item selector" data-action="ai_assistant">' +
            '<div class="menu__ico">' + AI_SVG + '</div>' +
            '<div class="menu__text">AI Ассистент</div>' +
          '</li>'
        );
        item.on('hover:enter', openAI);
        menu.eq(0).append(item);
      }
    }

    // Ищем шапку
    if (!headAdded) {
      var search = $('.head__actions .open--search');
      if (search.length) {
        headAdded = true;
        var btn = $(
          '<div class="selector open--ai-assistant" data-action="ai_head" style="' +
            'display:inline-flex;align-items:center;justify-content:center;' +
            'width:2.2em;height:2.2em;border-radius:0.3em;cursor:pointer;flex-shrink:0;' +
          '">' + AI_SVG + '</div>'
        );
        btn.on('hover:enter', openA
