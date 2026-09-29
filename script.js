(function () {
  "use strict";

  var PREVIEW_SECONDS = 30;
  var songs = [];
  var editingId = null;
  var currentAudio = null;
  var currentPlayingId = null;
  var currentTimer = null;
  var listEl = document.getElementById("songList");
  var countEl = document.getElementById("libraryCount");
  var addBtn = document.getElementById("addSongBtn");
  var form = document.getElementById("songForm");
  var formTitle = document.getElementById("songFormTitle");
  var formError = document.getElementById("formError");
  var cancelBtn = document.getElementById("cancelBtn");
  var discardBtn = document.getElementById("discardBtn");
  var saveBtn = document.getElementById("saveBtn");
  var searchInput = document.getElementById("searchSongs");
  var sortSelect = document.getElementById("sortSongs");
  var footnote = document.getElementById("collectionFootnote");
  var fields = {
    title: document.getElementById("f-title"),
    artist: document.getElementById("f-artist"),
    album: document.getElementById("f-album"),
    year: document.getElementById("f-year"),
    length: document.getElementById("f-length"),
    audioUrl: document.getElementById("f-audio")
  };

  function escapeHtml(value) {
    var element = document.createElement("span");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
  }

  async function request(url, options) {
    var response = await fetch(url, options);
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
    return payload;
  }

  async function loadSongs() {
    try {
      songs = await request("/api/songs");
      render();
    } catch (error) {
      listEl.innerHTML = '<div class="empty-state"><strong>Could not connect to your music database.</strong><span>Start the local server with <code>python app.py</code>, then refresh this page.</span></div>';
      countEl.textContent = "Unavailable";
      footnote.textContent = "Database connection required";
    }
  }

  function visibleSongs() {
    var term = searchInput.value.trim().toLowerCase();
    var filtered = songs.filter(function (song) {
      return !term || [song.title, song.artist, song.album].some(function (value) {
        return String(value || "").toLowerCase().includes(term);
      });
    });
    var sortBy = sortSelect.value;
    filtered.sort(function (a, b) {
      if (sortBy === "title" || sortBy === "artist") return String(a[sortBy] || "").localeCompare(String(b[sortBy] || ""));
      if (sortBy === "year") return (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title);
      return a.id - b.id;
    });
    return filtered;
  }

  function render() {
    var filteredSongs = visibleSongs();
    countEl.textContent = songs.length + (songs.length === 1 ? " track" : " tracks");
    footnote.textContent = filteredSongs.length === songs.length
      ? "Showing all " + songs.length + (songs.length === 1 ? " track" : " tracks")
      : "Showing " + filteredSongs.length + " of " + songs.length + " tracks";

    if (!filteredSongs.length) {
      var message = songs.length ? "No tracks match your search." : "Your library is empty. Add a song to get started.";
      listEl.innerHTML = '<div class="empty-state"><strong>' + message + '</strong><span>' + (songs.length ? "Try another title, artist, or album." : "Your collection will be saved to the local SQLite database.") + '</span></div>';
      return;
    }

    listEl.innerHTML = filteredSongs.map(function (song, index) {
      var details = [song.album, song.year, song.length].filter(Boolean).map(escapeHtml).join('<span class="meta-separator">·</span>');
      var palette = ["#596b9a", "#9b7252", "#557f79", "#86659a", "#697e50"];
      var initials = String(song.artist || "?").split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
      return '<article class="song-row" data-id="' + song.id + '">' +
        '<span class="song-index">' + String(index + 1).padStart(2, "0") + '</span>' +
        '<span class="album-art" style="--cover-color:' + palette[index % palette.length] + '" aria-hidden="true"><span>' + escapeHtml(initials) + '</span><i></i></span>' +
        '<div class="song-details"><h3>' + escapeHtml(song.title) + '</h3><p>' + escapeHtml(song.artist) + (details ? '<span class="meta-separator">·</span>' + details : "") + '</p></div>' +
        '<div class="song-actions">' +
          '<button class="action-button action-button--play" data-action="play" ' + (song.audioUrl ? 'aria-label="Play preview of ' + escapeHtml(song.title) + '"' : 'disabled aria-label="No preview available" title="Add a preview URL to play"') + '>▶</button>' +
          '<button class="action-button" data-action="edit" aria-label="Edit ' + escapeHtml(song.title) + '" title="Edit track">✎</button>' +
          '<button class="action-button action-button--delete" data-action="delete" aria-label="Delete ' + escapeHtml(song.title) + '" title="Delete track">⌫</button>' +
        '</div>' +
        '<div class="song-progress"><span class="song-box__progress-fill"></span></div>' +
      '</article>';
    }).join("");
  }

  function showError(message) {
    formError.textContent = message;
    formError.classList.add("is-visible");
  }

  function openForm(mode, song) {
    formError.classList.remove("is-visible");
    if (mode === "edit" && song) {
      editingId = song.id;
      formTitle.textContent = "Edit song details";
      saveBtn.textContent = "Save changes";
      fields.title.value = song.title || "";
      fields.artist.value = song.artist || "";
      fields.album.value = song.album || "";
      fields.year.value = song.year || "";
      fields.length.value = song.length || "";
      fields.audioUrl.value = song.audioUrl || "";
    } else {
      editingId = null;
      formTitle.textContent = "Add a song";
      saveBtn.textContent = "Add to library";
      form.reset();
    }
    form.classList.add("is-open");
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    fields.title.focus({ preventScroll: true });
  }

  function closeForm() {
    form.classList.remove("is-open");
    form.reset();
    editingId = null;
    formError.classList.remove("is-visible");
  }

  function collectFormData() {
    return {
      title: fields.title.value.trim(),
      artist: fields.artist.value.trim(),
      album: fields.album.value.trim(),
      year: fields.year.value.trim(),
      length: fields.length.value.trim(),
      audioUrl: fields.audioUrl.value.trim()
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    var data = collectFormData();
    if (!data.title || !data.artist) {
      showError("Song title and artist are required.");
      return;
    }
    var savedId = editingId;
    saveBtn.disabled = true;
    saveBtn.textContent = savedId ? "Saving…" : "Adding…";
    try {
      if (savedId) {
        await request("/api/songs/" + savedId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      } else {
        await request("/api/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      }
      closeForm();
      await loadSongs();
    } catch (error) {
      showError(error.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = editingId ? "Save changes" : "Add to library";
    }
  }

  function stopPreview() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
    }
    listEl.querySelectorAll(".action-button--playing").forEach(function (button) {
      button.textContent = "▶";
      button.classList.remove("action-button--playing");
    });
    listEl.querySelectorAll(".song-box__progress-fill").forEach(function (fill) { fill.style.width = "0%"; });
    currentPlayingId = null;
  }

  function playPreview(song, button, fill) {
    if (currentPlayingId === song.id) {
      stopPreview();
      return;
    }
    stopPreview();
    if (!song.audioUrl) return;
    var audio = new Audio(song.audioUrl);
    var startedAt = Date.now();
    audio.addEventListener("error", function () {
      stopPreview();
      showError("The preview could not be loaded. Check the URL and try again.");
    });
    audio.play().then(function () {
      currentAudio = audio;
      currentPlayingId = song.id;
      button.textContent = "Ⅱ";
      button.classList.add("action-button--playing");
      currentTimer = setInterval(function () {
        var elapsed = (Date.now() - startedAt) / 1000;
        fill.style.width = Math.min(100, elapsed / PREVIEW_SECONDS * 100) + "%";
        if (elapsed >= PREVIEW_SECONDS) stopPreview();
      }, 100);
      audio.addEventListener("ended", stopPreview);
    }).catch(function () {
      stopPreview();
      showError("Playback was blocked or the preview URL is invalid.");
    });
  }

  async function handleListClick(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var row = button.closest(".song-row");
    if (!row) return;
    var id = Number(row.getAttribute("data-id"));
    var song = songs.find(function (item) { return item.id === id; });
    if (!song) return;
    var action = button.getAttribute("data-action");
    if (action === "play") {
      playPreview(song, button, row.querySelector(".song-box__progress-fill"));
    } else if (action === "edit") {
      openForm("edit", song);
    } else if (action === "delete") {
      if (!window.confirm('Delete “' + song.title + '” from your library? This cannot be undone.')) return;
      button.disabled = true;
      try {
        await request("/api/songs/" + id, { method: "DELETE" });
        if (currentPlayingId === id) stopPreview();
        await loadSongs();
      } catch (error) {
        button.disabled = false;
        window.alert(error.message);
      }
    }
  }

  addBtn.addEventListener("click", function () {
    if (form.classList.contains("is-open") && !editingId) closeForm();
    else openForm("add");
  });
  cancelBtn.addEventListener("click", closeForm);
  discardBtn.addEventListener("click", closeForm);
  form.addEventListener("submit", handleSubmit);
  listEl.addEventListener("click", handleListClick);
  searchInput.addEventListener("input", render);
  sortSelect.addEventListener("change", render);
  loadSongs();
})();
