import { gsap } from '../../node_modules/gsap/index.js';

function metadataLine(label, value) {
  const row = document.createElement('div');

  const labelSpan = document.createElement('span');
  labelSpan.className = 'metadataLabel';
  labelSpan.textContent = `${label}: `;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'metadataValue';
  valueSpan.textContent = `${value}`;

  row.append(labelSpan, valueSpan);
  return row;
}

function setExpandButtonState(button, isExpanded) {
  button.textContent = isExpanded ? 'Info ▼' : 'Info ▶';
  button.setAttribute('aria-expanded', String(isExpanded));
}

function createMetadataDetails(track, metadata) {
  const details = document.createElement('div');
  details.className = 'metadata';
  details.append(
    metadataLine('Artist', metadata?.artist || 'Unknown Artist'),
    metadataLine('Album', metadata?.album || 'Unknown Album'),
    metadataLine('Title', metadata?.title || track.name),
    metadataLine('Duration', metadata?.duration || '0:00'),
    metadataLine('Bitrate', metadata?.bitrate || '-'),
    metadataLine('Sample Rate', metadata?.sampleRate || '-'),
    metadataLine('Rating', metadata?.rating ? `${metadata.rating}/5` : 'Unrated'),
    metadataLine('Year', metadata?.year || '-'),
    metadataLine('Format', metadata?.format || track.ext.replace('.', '').toUpperCase()),
    metadataLine('File path', track.path)
  );

  return details;
}

export class TrackListComponent {
  constructor({
    trackListElement,
    playlistStore,
    player,
    metadataByPath,
    getScrollConfig,
    onPlayTrack,
    onOpenRemoveDialog,
    onSetTrackRating
  }) {
    this.trackListElement = trackListElement;
    this.playlistStore = playlistStore;
    this.player = player;
    this.metadataByPath = metadataByPath;
    this.getScrollConfig = getScrollConfig;
    this.onPlayTrack = onPlayTrack;
    this.onOpenRemoveDialog = onOpenRemoveDialog;
    this.onSetTrackRating = onSetTrackRating;
  }

  render({ scrollTarget = 'none', smooth = false } = {}) {
    this.trackListElement.innerHTML = '';
    let currentElement = null;
    let selectedElement = null;

    this.playlistStore.tracks.forEach((track, index) => {
      const container = document.createElement('article');
      container.className = 'trackItem';
      const isCurrentTrack = index === this.player.currentIndex;
      const isSelected = index === this.playlistStore.selectedIndex;
      const isPlaying = isCurrentTrack && this.player.isPlaying;

      if (isCurrentTrack) container.classList.add('selected');
      if (isPlaying) container.classList.add('playing');

      const metadata = this.metadataByPath.get(track.path);
      const lineLabel = `${index + 1}. ${metadata?.artist ? `${metadata.artist} - ` : ''}${track.name}`;

      const head = document.createElement('div');
      head.className = 'trackHead';
      head.dataset.trackPath = track.path;
      head.tabIndex = 0;
      head.setAttribute('role', 'option');
      head.setAttribute('aria-selected', String(isSelected));

      const main = document.createElement('div');
      main.className = 'trackMain';
      main.textContent = `${isPlaying ? '♪ ' : ''}${lineLabel}`;

      const actions = document.createElement('div');
      actions.className = 'trackActions';

      const ratingControl = this.createRatingControl(track.path, metadata?.rating || 0);

      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'iconBtn expandBtn';
      expandBtn.title = 'Expand metadata';
      setExpandButtonState(expandBtn, this.playlistStore.isExpanded(track.path));

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'iconBtn deleteBtn';
      removeBtn.title = 'Remove or delete track';
      removeBtn.textContent = 'DELETE';

      expandBtn.addEventListener('click', (event) => {
        event.stopPropagation();

        const isExpanded = this.playlistStore.isExpanded(track.path);
        const existingDetails = container.querySelector('.metadata');

        if (isExpanded) {
          this.playlistStore.toggleExpanded(track.path);
          setExpandButtonState(expandBtn, false);
          if (existingDetails) {
            this.animateMetadataCollapse(existingDetails);
          }
          return;
        }

        this.collapseExpandedMetadataRows(track.path);
        this.playlistStore.toggleExpanded(track.path);

        // Guard against stale nodes when users toggle quickly during animation.
        container.querySelectorAll('.metadata').forEach((staleDetails) => {
          gsap.killTweensOf(staleDetails);
          staleDetails.remove();
        });

        setExpandButtonState(expandBtn, true);
        const details = createMetadataDetails(track, metadata);
        container.append(details);
        this.animateMetadataExpand(details);
      });

      expandBtn.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onOpenRemoveDialog(track.path);
      });

      removeBtn.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      head.addEventListener('click', () => {
        // Single click is intentionally inert; double click controls track targeting.
      });

      head.addEventListener('dblclick', async () => {
        this.playlistStore.select(index);
        await this.onPlayTrack(index);
      });

      actions.append(ratingControl, expandBtn, removeBtn);
      head.append(main, actions);
      container.append(head);

      if (this.playlistStore.isExpanded(track.path)) {
        const details = createMetadataDetails(track, metadata);
        container.append(details);
      }

      if (isCurrentTrack) {
        currentElement = container;
      }

      if (isSelected) {
        selectedElement = container;
      }

      this.trackListElement.append(container);
    });

    if (scrollTarget === 'selected' && selectedElement) {
      this.scrollTrackIntoView(selectedElement, { block: 'start', smooth });
      return;
    }

    if (scrollTarget === 'current' && currentElement) {
      this.scrollTrackIntoView(currentElement, { block: 'nearest', smooth });
      return;
    }

    if (scrollTarget === 'auto') {
      if (this.player.isPlaying && currentElement) {
        this.scrollTrackIntoView(currentElement, { block: 'nearest', smooth: true });
        return;
      }

      if (selectedElement) {
        this.scrollTrackIntoView(selectedElement, { block: 'start', smooth: true });
      }
    }
  }

  createRatingControl(trackPath, currentRating) {
    const stars = document.createElement('div');
    stars.className = 'ratingStars';
    stars.setAttribute('role', 'group');
    stars.setAttribute('aria-label', 'Set track rating');

    for (let starValue = 1; starValue <= 5; starValue += 1) {
      const starBtn = document.createElement('button');
      starBtn.type = 'button';
      starBtn.className = 'ratingStarBtn';
      starBtn.title = `Set ${starValue} star rating`;
      starBtn.textContent = starValue <= currentRating ? '★' : '☆';
      starBtn.setAttribute('aria-label', `Rate ${starValue} stars`);
      starBtn.classList.toggle('filled', starValue <= currentRating);

      starBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const nextRating = starValue === currentRating ? 0 : starValue;
        await this.onSetTrackRating(trackPath, nextRating);
      });

      starBtn.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      stars.append(starBtn);
    }

    return stars;
  }

  collapseExpandedMetadataRows(exceptTrackPath) {
    const trackItems = this.trackListElement.querySelectorAll('.trackItem');
    trackItems.forEach((trackItem) => {
      const head = trackItem.querySelector('.trackHead');
      if (!head) return;

      const trackPath = head.dataset.trackPath;
      if (trackPath === exceptTrackPath) return;

      const details = trackItem.querySelector('.metadata');
      if (details) {
        this.animateMetadataCollapse(details);
      }

      const expandBtn = trackItem.querySelector('.expandBtn');
      if (expandBtn) {
        setExpandButtonState(expandBtn, false);
      }
    });
  }

  animateMetadataExpand(detailsElement) {
    const { infoToggleSeconds } = this.getScrollConfig();
    const duration = Math.max(0, Number(infoToggleSeconds) || 0);
    if (duration <= 0) {
      gsap.set(detailsElement, { clearProps: 'height,overflow,opacity' });
      return;
    }

    // Measure natural open height first, then animate from collapsed state.
    gsap.set(detailsElement, {
      height: 'auto',
      opacity: 1,
      paddingTop: 0,
      paddingBottom: 8,
      overflow: 'hidden'
    });
    const targetHeight = detailsElement.getBoundingClientRect().height;

    gsap.set(detailsElement, {
      height: 0,
      opacity: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden'
    });

    gsap.killTweensOf(detailsElement);
    gsap.to(detailsElement, {
      duration,
      ease: 'power2.out',
      height: targetHeight,
      opacity: 1,
      paddingTop: 0,
      paddingBottom: 8,
      onComplete: () => {
        gsap.set(detailsElement, { clearProps: 'height,overflow,opacity,paddingTop,paddingBottom' });
      }
    });
  }

  animateMetadataCollapse(detailsElement) {
    const { infoToggleSeconds } = this.getScrollConfig();
    const duration = Math.max(0, Number(infoToggleSeconds) || 0);
    if (duration <= 0) {
      detailsElement.remove();
      return;
    }

    gsap.killTweensOf(detailsElement);
    gsap.to(detailsElement, {
      duration,
      ease: 'power2.in',
      height: 0,
      opacity: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden',
      onComplete: () => {
        detailsElement.remove();
      }
    });
  }

  scrollTrackIntoView(targetElement, { block = 'nearest', smooth = false } = {}) {
    if (!targetElement) return;

    const container = this.trackListElement;
    if (!container) return;

    const targetTop = targetElement.offsetTop;
    const targetBottom = targetTop + targetElement.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    let fallbackTop = viewTop;
    if (block === 'start') {
      fallbackTop = Math.max(0, targetTop);
    } else if (targetTop < viewTop) {
      fallbackTop = Math.max(0, targetTop);
    } else if (targetBottom > viewBottom) {
      fallbackTop = Math.max(0, targetBottom - container.clientHeight);
    }

    if (Math.abs(fallbackTop - container.scrollTop) <= 1) {
      return;
    }

    const { playlistSeconds, startupSeconds } = this.getScrollConfig();
    const duration = smooth ? startupSeconds : playlistSeconds;

    gsap.killTweensOf(container);
    gsap.to(container, {
      duration,
      ease: 'power2.out',
      scrollTop: fallbackTop
    });
  }
}

