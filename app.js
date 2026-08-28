(function () {
  "use strict";

  var data = window.ALBUM_DATA;

  if (!data || !Array.isArray(data.entries)) {
    console.error("Album data is missing or invalid.");
    document.querySelector("[data-entries]").innerHTML =
      '<div class="text-placeholder"><p>Album data is unavailable right now.</p></div>';
    return;
  }

  var prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  var speechSynthesisApi =
    "speechSynthesis" in window ? window.speechSynthesis : null;
  var entries = data.entries
    .slice()
    .sort(function (left, right) {
      return left.date.localeCompare(right.date);
    })
    .filter(function (entry) {
      var isValid = /^\d{4}-\d{2}-\d{2}$/.test(entry.date);

      if (!isValid) {
        console.warn("Skipping entry with unexpected date format:", entry);
      }

      return isValid;
    });

  var state = {
    currentIndex: -1,
    visibleIds: new Map(),
    lightboxTrigger: null,
    speakingButton: null,
    activeUtterance: null,
    audioButton: null,
    activeAudio: null,
    language: getInitialLanguage(),
    entryObserver: null,
  };

  var monthFirstEntry = new Map();
  var elements = {
    albumTitle: document.querySelector("[data-album-title]"),
    albumRange: document.querySelector("[data-album-range]"),
    albumSubtitle: document.querySelector("[data-album-subtitle]"),
    albumEyebrow: document.querySelector("[data-album-eyebrow]"),
    skipLink: document.querySelector("[data-skip-link]"),
    scrollPrompt: document.querySelector("[data-scroll-prompt]"),
    headerNavigation: document.querySelector("[data-header-navigation]"),
    beginLink: document.querySelector("[data-begin-link]"),
    coverCollage: document.querySelector("[data-cover-collage]"),
    entries: document.querySelector("[data-entries]"),
    monthButtons: Array.prototype.slice.call(
      document.querySelectorAll("[data-month-button]"),
    ),
    languageButtons: Array.prototype.slice.call(
      document.querySelectorAll("[data-language-button]"),
    ),
    lightbox: document.querySelector("[data-lightbox]"),
    lightboxBackdrop: document.querySelector("[data-lightbox-backdrop]"),
    lightboxClose: document.querySelector("[data-lightbox-close]"),
    lightboxImage: document.querySelector("[data-lightbox-image]"),
    lightboxCaption: document.querySelector("[data-lightbox-caption]"),
    template: document.querySelector("#entry-template"),
  };

  var entryById = new Map();

  entries.forEach(function (entry, index) {
    if (!monthFirstEntry.has(entry.date.slice(5, 7))) {
      monthFirstEntry.set(entry.date.slice(5, 7), entry.date);
    }

    entryById.set(entry.date, {
      entry: entry,
      index: index,
    });
  });

  renderCover();
  renderEntries();
  bindMonthDock();
  bindLanguageToggle();
  bindGlobalNavigation();
  bindLightbox();
  bindSpeech();

  window.requestAnimationFrame(function () {
    handleInitialHash();
    activateObserver();
    updateActiveStateFromViewport();
  });

  function renderCover() {
    var copy = getCopy();

    document.documentElement.lang = state.language === "bn" ? "bn" : "en";
    document.title = copy.albumTitle || "Photo Album";
    elements.albumTitle.textContent = copy.albumTitle || "Photo Album";
    elements.albumRange.textContent = copy.dateRange || "";
    elements.albumSubtitle.textContent = copy.subtitle || "";
    elements.albumEyebrow.textContent = copy.eyebrow;
    elements.skipLink.textContent = copy.skipToEntries;
    elements.beginLink.textContent = copy.openFirstEntry;
    elements.scrollPrompt.textContent = copy.scrollToBegin;
    elements.entries.setAttribute("aria-label", copy.entriesLabel);
    elements.headerNavigation.setAttribute("aria-label", copy.navigationLabel);

    var firstEntry = entries[0];
    elements.beginLink.setAttribute(
      "href",
      firstEntry ? "#" + firstEntry.date : "#entries-start",
    );

    (data.coverPhotos || []).slice(0, 3).forEach(function (photo, index) {
      var figure = document.createElement("figure");
      var button = document.createElement("button");
      var image = document.createElement("img");

      figure.className = "cover-photo";
      button.className = "cover-photo-button";
      button.type = "button";
      button.dataset.lightboxSrc = photo.src;
      button.dataset.lightboxAlt = getPhotoAlt(photo) || "";
      button.dataset.lightboxCaption = copy.albumTitle || copy.coverPhoto;
      image.src = photo.src;
      image.alt = getPhotoAlt(photo) || "";
      image.loading = "eager";
      image.decoding = "async";
      image.addEventListener("error", function () {
        image.src = createFallbackPlaceholder("Cover " + (index + 1));
        button.dataset.lightboxSrc = image.src;
      });
      button.appendChild(image);
      figure.appendChild(button);
      elements.coverCollage.appendChild(figure);
    });
  }

  function renderEntries() {
    elements.entries.innerHTML = "";

    entries.forEach(function (entry, index) {
      var fragment = elements.template.content.cloneNode(true);
      var article = fragment.querySelector("[data-entry]");
      var date = fragment.querySelector("[data-entry-date]");
      var title = fragment.querySelector("[data-entry-title]");
      var description = fragment.querySelector("[data-entry-description]");
      var media = fragment.querySelector("[data-entry-media]");
      var speechControls = createSpeechControls(entry);

      article.id = entry.date;
      article.dataset.date = entry.date;
      article.dataset.index = String(index);
      article.classList.toggle("is-reversed", index % 2 === 1);

      date.textContent = formatDate(entry.date, "long");
      title.textContent = getEntryText(entry, "title") || formatDate(entry.date, "short");
      description.textContent = getEntryText(entry, "description") || getCopy().descriptionComingSoon;
      description.insertAdjacentElement("afterend", speechControls);

      if (renderMedia(media, entry)) {
        article.classList.remove("is-text-only");
      } else {
        media.remove();
        article.classList.add("is-text-only");
      }

      elements.entries.appendChild(fragment);
    });
  }

  function createSpeechControls(entry) {
    var controls = document.createElement("div");
    var button = document.createElement("button");
    var copy = getCopy();
    var text = getEntryText(entry, "description") || copy.descriptionComingSoon;
    var audioUrl = state.language === "bn" ? getBengaliAudio(entry) : "";

    controls.className = "entry-audio-controls";
    button.type = "button";
    button.className = "entry-audio-button";
    button.dataset.speechText = text;
    button.dataset.speechLanguage = "en-CA";
    button.textContent = copy.listen;
    button.setAttribute("aria-label", copy.readDescription);

    if (audioUrl) {
      button.dataset.audioSrc = audioUrl;
    } else if (state.language === "bn") {
      button.disabled = true;
      button.textContent = copy.audioPending;
    } else if (!speechSynthesisApi) {
      button.disabled = true;
      button.textContent = copy.audioUnavailable;
    }

    controls.appendChild(button);
    return controls;
  }

  function renderMedia(container, entry) {
    var photos = Array.isArray(entry.photos) ? entry.photos.slice(0, 3) : [];

    if (!photos.length) {
      return false;
    }

    container.classList.add("media-layout-" + photos.length);

    photos.forEach(function (photo, photoIndex) {
      var figure = document.createElement("figure");
      var button = document.createElement("button");
      var image = document.createElement("img");
      var caption = document.createElement("figcaption");
      var label = formatDate(entry.date, "short") + " " + getCopy().photo + " " + (photoIndex + 1);
      var captionText =
        formatDate(entry.date, "short") +
        " - " +
        (photoIndex + 1);

      figure.className = "photo-card";
      button.className = "photo-card-button";
      button.type = "button";
      button.dataset.lightboxSrc = photo.src;
      button.dataset.lightboxAlt = getPhotoAlt(photo) || label;
      button.dataset.lightboxCaption = getPhotoAlt(photo) || getEntryText(entry, "title") || captionText;
      image.src = photo.src;
      image.alt = getPhotoAlt(photo) || label;
      image.loading = "lazy";
      image.decoding = "async";
      image.style.objectPosition = photo.objectPosition || "50% 50%";
      image.addEventListener("error", function () {
        image.src = createFallbackPlaceholder(label);
        button.dataset.lightboxSrc = image.src;
      });

      caption.textContent = captionText;
      button.appendChild(image);
      figure.appendChild(button);
      figure.appendChild(caption);
      container.appendChild(figure);
    });

    return true;
  }

  function bindMonthDock() {
    elements.monthButtons.forEach(function (button) {
      var monthValue = button.dataset.monthButton;

      if (!monthFirstEntry.has(monthValue)) {
        button.hidden = true;
        return;
      }

      button.addEventListener("click", function () {
        navigateToHash("#" + monthFirstEntry.get(monthValue), true);
      });
    });
  }

  function bindLanguageToggle() {
    elements.languageButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var language = button.dataset.languageButton;

        if (language === state.language) {
          return;
        }

        state.language = language;
        stopSpeech();
        saveLanguage(language);
        renderCover();
        renderEntries();
        updateLanguageToggle();
        activateObserver();
      });
    });

    updateLanguageToggle();
  }

  function getInitialLanguage() {
    try {
      return window.localStorage.getItem("photo-album-language") === "en"
        ? "en"
        : "bn";
    } catch (error) {
      return "bn";
    }
  }

  function saveLanguage(language) {
    try {
      window.localStorage.setItem("photo-album-language", language);
    } catch (error) {
      // Language selection remains available when storage is blocked.
    }
  }

  function getCopy() {
    var english = {
      albumTitle: data.albumTitle || "Photo Album",
      dateRange: data.dateRange || "",
      subtitle: data.subtitle || "",
      eyebrow: "Static summer journal",
      skipToEntries: "Skip to album entries",
      openFirstEntry: "Open first entry",
      scrollToBegin: "Scroll to begin",
      entriesLabel: "Photo journal entries",
      navigationLabel: "Album navigation",
      coverPhoto: "Album cover photo",
      descriptionComingSoon: "Description coming soon.",
      listen: "Listen",
      stop: "Stop",
      readDescription: "Read this description aloud",
      stopReading: "Stop reading this description",
      audioUnavailable: "Audio unavailable",
      photo: "photo",
      months: { "06": "Jun", "07": "Jul", "08": "Aug" },
    };

    return state.language === "bn" ? Object.assign(english, data.bengali || {}) : english;
  }

  function getEntryText(entry, field) {
    var translations = data.bengali && data.bengali.entries;
    var translatedEntry = translations && translations[entry.date];

    if (state.language === "bn" && translatedEntry && translatedEntry[field]) {
      return translatedEntry[field];
    }

    return entry[field] || "";
  }

  function getBengaliAudio(entry) {
    var translations = data.bengali && data.bengali.entries;
    var translatedEntry = translations && translations[entry.date];

    return translatedEntry && typeof translatedEntry.audio === "string"
      ? translatedEntry.audio.trim()
      : "";
  }

  function getPhotoAlt(photo) {
    return photo.alt || "";
  }

  function formatDate(value, style) {
    var options = style === "short"
      ? { month: "short", day: "numeric" }
      : { weekday: "long", month: "long", day: "numeric", year: "numeric" };
    var locale = state.language === "bn" ? "bn-BD" : "en-US";

    return new Intl.DateTimeFormat(locale, options).format(
      new Date(value + "T12:00:00"),
    );
  }

  function updateLanguageToggle() {
    var copy = getCopy();

    elements.languageButtons.forEach(function (button) {
      var isActive = button.dataset.languageButton === state.language;

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    elements.monthButtons.forEach(function (button) {
      button.textContent = copy.months[button.dataset.monthButton] || "";
    });
  }

  function bindGlobalNavigation() {
    window.addEventListener("hashchange", function () {
      if (!location.hash) {
        updateSelection(-1);
        return;
      }

      var target = getHashTarget(location.hash);

      if (!target) {
        handleInvalidHash();
        return;
      }

      updateSelectionFromHash(location.hash);
    });
  }

  function bindLightbox() {
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-lightbox-src]");

      if (trigger) {
        openLightbox(trigger);
      }
    });

    elements.lightboxClose.addEventListener("click", closeLightbox);
    elements.lightboxBackdrop.addEventListener("click", closeLightbox);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !elements.lightbox.hidden) {
        closeLightbox();
      }
    });
  }

  function bindSpeech() {
    document.addEventListener("click", function (event) {
      var button = event.target.closest(".entry-audio-button");

      if (!button || button.disabled) {
        return;
      }

      if (button.dataset.audioSrc) {
        toggleAudio(button);
      } else {
        toggleSpeech(button);
      }
    });

    window.addEventListener("beforeunload", stopSpeech);
  }

  function activateObserver() {
    if (state.entryObserver) {
      state.entryObserver.disconnect();
    }

    var cards = Array.prototype.slice.call(
      document.querySelectorAll("[data-entry]"),
    );

    if (!("IntersectionObserver" in window)) {
      console.warn(
        "IntersectionObserver is unavailable; navigation state will update on direct navigation only.",
      );
      return;
    }

    state.entryObserver = new IntersectionObserver(
      function (observations) {
        observations.forEach(function (observation) {
          var id = observation.target.id;

          if (observation.isIntersecting) {
            state.visibleIds.set(id, observation.intersectionRatio);
            observation.target.classList.add("is-visible");
          } else {
            state.visibleIds.delete(id);
          }
        });

        updateActiveStateFromViewport();
      },
      {
        rootMargin: "-20% 0px -40% 0px",
        threshold: [0.2, 0.45, 0.75],
      },
    );

    cards.forEach(function (card) {
      state.entryObserver.observe(card);
    });
  }

  function updateActiveStateFromViewport() {
    if (!state.visibleIds.size) {
      return;
    }

    var activeId = Array.from(state.visibleIds.entries()).sort(
      function (left, right) {
        return right[1] - left[1];
      },
    )[0][0];

    updateSelectionFromHash("#" + activeId, true);
  }

  function navigateToHash(hash, shouldSmoothScroll) {
    if (hash === "#cover") {
      history.replaceState(null, "", "#cover");
      document.querySelector("#cover").scrollIntoView({
        behavior: getScrollBehavior(shouldSmoothScroll),
      });
      updateSelection(-1);
      return;
    }

    var target = getHashTarget(hash);

    if (!target) {
      handleInvalidHash();
      return;
    }

    history.replaceState(null, "", hash);
    target.scrollIntoView({
      behavior: getScrollBehavior(shouldSmoothScroll),
      block: "start",
    });
    updateSelectionFromHash(hash);
  }

  function getScrollBehavior(shouldSmoothScroll) {
    return shouldSmoothScroll && !prefersReducedMotion.matches
      ? "smooth"
      : "auto";
  }

  function updateSelectionFromHash(hash, fromObserver) {
    var id = hash.replace("#", "");
    var resolved = entryById.get(id);

    if (!resolved) {
      updateSelection(-1);
      return;
    }

    updateSelection(resolved.index, fromObserver);
  }

  function updateSelection(index, fromObserver) {
    state.currentIndex = index;

    if (index === -1) {
      setActiveMonth(null);
      if (!fromObserver) {
        history.replaceState(null, "", "#cover");
      }
      return;
    }

    var entry = entries[index];
    var month = entry.date.slice(5, 7);

    setActiveMonth(month);

    if (fromObserver) {
      history.replaceState(null, "", "#" + entry.date);
    }
  }

  function handleInitialHash() {
    if (!location.hash || location.hash === "#cover") {
      updateSelection(-1);
      return;
    }

    var target = getHashTarget(location.hash);

    if (!target) {
      handleInvalidHash();
      return;
    }

    target.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
    updateSelectionFromHash(location.hash);
  }

  function handleInvalidHash() {
    console.warn("Invalid hash supplied. Returning to cover:", location.hash);
    navigateToHash("#cover", false);
  }

  function getHashTarget(hash) {
    var id = String(hash || "").replace(/^#/, "");

    if (!id) {
      return null;
    }

    return document.getElementById(id);
  }

  function setActiveMonth(month) {
    elements.monthButtons.forEach(function (button) {
      var isActive = month && button.dataset.monthButton === month;

      button.classList.toggle("is-active", isActive);

      if (isActive) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function toggleSpeech(button) {
    if (state.speakingButton === button) {
      stopSpeech();
      return;
    }

    stopSpeech();

    var utterance = new SpeechSynthesisUtterance(
      button.dataset.speechText || "",
    );
    var selectedVoice = resolveSpeechVoice();

    utterance.rate = 0.92;
    utterance.pitch = 0.96;
    utterance.lang = selectedVoice
      ? selectedVoice.lang
      : button.dataset.speechLanguage || "en-CA";

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = resetSpeechState;
    utterance.onerror = resetSpeechState;

    state.speakingButton = button;
    state.activeUtterance = utterance;
    button.classList.add("is-speaking");
    button.textContent = getCopy().stop;
    button.setAttribute("aria-label", getCopy().stopReading);
    speechSynthesisApi.cancel();
    speechSynthesisApi.speak(utterance);
  }

  function toggleAudio(button) {
    if (state.audioButton === button) {
      stopAudio();
      return;
    }

    stopSpeech();

    var audio = new Audio(button.dataset.audioSrc);

    state.audioButton = button;
    state.activeAudio = audio;
    button.classList.add("is-speaking");
    button.textContent = getCopy().stop;
    button.setAttribute("aria-label", getCopy().stopReading);
    audio.addEventListener("ended", resetAudioState);
    audio.addEventListener("error", resetAudioState);
    audio.play().catch(resetAudioState);
  }

  function stopSpeech() {
    if (
      speechSynthesisApi &&
      (speechSynthesisApi.speaking || speechSynthesisApi.pending)
    ) {
      speechSynthesisApi.cancel();
    }

    resetSpeechState();
    stopAudio();
  }

  function stopAudio() {
    if (state.activeAudio) {
      state.activeAudio.pause();
      state.activeAudio.currentTime = 0;
    }

    resetAudioState();
  }

  function resetSpeechState() {
    if (!state.speakingButton) {
      state.activeUtterance = null;
      return;
    }

    state.speakingButton.classList.remove("is-speaking");
    state.speakingButton.textContent = getCopy().listen;
    state.speakingButton.setAttribute(
      "aria-label",
      getCopy().readDescription,
    );
    state.speakingButton = null;
    state.activeUtterance = null;
  }

  function resetAudioState() {
    if (!state.audioButton) {
      state.activeAudio = null;
      return;
    }

    state.audioButton.classList.remove("is-speaking");
    state.audioButton.textContent = getCopy().listen;
    state.audioButton.setAttribute("aria-label", getCopy().readDescription);
    state.audioButton = null;
    state.activeAudio = null;
  }

  function resolveSpeechVoice() {
    if (!speechSynthesisApi) {
      return null;
    }

    var voices = speechSynthesisApi.getVoices().slice();
    var bestVoice = null;
    var bestScore = -Infinity;

    voices.forEach(function (voice) {
      var score = 0;
      var voiceName = voice.name.toLowerCase();
      var voiceLang = voice.lang.toLowerCase();
      var langPreferences = ["en-CA", "en-US", "en-GB", "en-AU", "en"];
      var preferredNames = [
        "samantha",
        "ava",
        "allison",
        "victoria",
        "karen",
        "serena",
        "aria",
        "jenny",
        "google us english",
        "google uk english female",
      ];

      langPreferences.forEach(function (lang, index) {
        var lowered = lang.toLowerCase();

        if (voiceLang === lowered) {
          score += 120 - index * 10;
        } else if (voiceLang.indexOf(lowered) === 0) {
          score += 90 - index * 8;
        }
      });

      preferredNames.forEach(function (name, index) {
        if (voiceName.indexOf(name) !== -1) {
          score += 40 - index * 2;
        }
      });

      if (voice.localService) {
        score += 8;
      }

      if (voice.default) {
        score += 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestVoice = voice;
      }
    });

    return bestScore > 0 ? bestVoice : null;
  }

  function openLightbox(trigger) {
    stopSpeech();
    state.lightboxTrigger = trigger;
    elements.lightboxImage.src = trigger.dataset.lightboxSrc || "";
    elements.lightboxImage.alt = trigger.dataset.lightboxAlt || "";
    elements.lightboxCaption.textContent =
      trigger.dataset.lightboxCaption || "";
    elements.lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    elements.lightboxClose.focus();
  }

  function closeLightbox() {
    if (elements.lightbox.hidden) {
      return;
    }

    elements.lightbox.hidden = true;
    elements.lightboxImage.removeAttribute("src");
    elements.lightboxCaption.textContent = "";
    document.body.classList.remove("lightbox-open");

    if (state.lightboxTrigger) {
      state.lightboxTrigger.focus();
      state.lightboxTrigger = null;
    }
  }

  function createFallbackPlaceholder(label) {
    var safeLabel = String(label)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="' +
      safeLabel +
      '">' +
      '<rect width="1200" height="900" fill="#efe4d4"/>' +
      '<rect x="40" y="40" width="1120" height="820" rx="42" fill="#f9f2e7" stroke="#cfae90" stroke-width="4" stroke-dasharray="10 14"/>' +
      '<text x="600" y="430" text-anchor="middle" fill="#845239" font-family="Georgia, serif" font-size="58">' +
      safeLabel +
      "</text>" +
      '<text x="600" y="510" text-anchor="middle" fill="#9a7f68" font-family="Arial, sans-serif" font-size="28">Missing image fallback</text>' +
      "</svg>";

    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }
})();
