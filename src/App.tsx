import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Gamepad2,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import rawCatalog from './catalog.generated.json';
import type { Catalog, Game, Photo, Evidence } from './types';
import { createSearch, emptyFilters, matchesFilters, similarGames } from './search';
import { newProposal, proposalText } from './proposals';
import type { Proposal } from './proposals';

const catalog = rawCatalog as Catalog;
const search = createSearch(catalog.games);
const assets = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const range = (value?: { min: number; max: number }) =>
  value ? (value.min === value.max ? `${value.min}` : `${value.min}–${value.max}`) : 'Not checked';
const kinds: Record<Game['kind'], string> = {
  game: 'Game',
  expansion: 'Expansion',
  accessory: 'Accessory',
  unknown: 'Unidentified',
};
const allTags = [...new Set(catalog.games.flatMap((game) => game.tags))].sort();
const commonTags = [
  'Cooperative',
  'Competitive',
  'Family',
  'Party',
  'Strategy',
  'Deduction',
  'Word game',
  'Storytelling',
  'Two-player',
];
const popularTags = commonTags.filter((tag) => allTags.includes(tag));
const relay = import.meta.env.VITE_PROPOSAL_ENDPOINT || '';

function Crop({ photo, evidence }: { photo: Photo; evidence: Evidence }) {
  const r = evidence.region;
  return (
    <div
      className="crop"
      style={{ aspectRatio: `${photo.width * r.width}/${photo.height * r.height}` }}
    >
      <img
        alt=""
        src={assets(photo.src)}
        loading="lazy"
        style={{
          width: `${100 / r.width}%`,
          maxWidth: 'none',
          height: `${100 / r.height}%`,
          left: `${(-100 * r.x) / r.width}%`,
          top: `${(-100 * r.y) / r.height}%`,
        }}
      />
    </div>
  );
}
function Artwork({ game, large = false }: { game: Game; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const evidence = game.evidence[0];
  const photo = catalog.photos.find((p) => p.id === evidence?.photoId);
  return (
    <div className={`artwork ${large ? 'artwork-large' : ''}`}>
      {game.image && !failed ? (
        <img
          src={large ? game.image.full : game.image.thumbnail}
          alt={`${game.title} box artwork`}
          loading={large ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : evidence && photo ? (
        <Crop photo={photo} evidence={evidence} />
      ) : (
        <div className="artwork-missing">
          <Gamepad2 aria-hidden="true" />
          <span>Image pending</span>
        </div>
      )}
    </div>
  );
}
function Facts({ game, full = false }: { game: Game; full?: boolean }) {
  if (full)
    return (
      <dl className="detail-facts">
        <div>
          <dt>
            <Users size={15} /> Players
          </dt>
          <dd>{range(game.players)}</dd>
        </div>
        <div>
          <dt>
            <Clock3 size={15} /> Minutes
          </dt>
          <dd>{range(game.minutes)}</dd>
        </div>
        <div>
          <dt>Suggested age</dt>
          <dd>{game.minAge ? `${game.minAge}+` : 'Not checked'}</dd>
        </div>
      </dl>
    );
  return (
    <div className="facts">
      {game.players && (
        <span>
          <Users size={13} /> {range(game.players)} players
        </span>
      )}
      {game.minutes && (
        <span>
          <Clock3 size={13} /> {range(game.minutes)} min
        </span>
      )}
      {game.minAge && <span>{game.minAge}+</span>}
      {!game.players && !game.minutes && <span className="muted">Play details not checked</span>}
    </div>
  );
}
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  const pattern = new RegExp(`(${escaped.join('|')})`, 'ig');
  return <>{text.split(pattern).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

export default function App() {
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState('title');
  const [limit, setLimit] = useState(24);
  const [moreTags, setMoreTags] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(-1);
  const [selected, setSelected] = useState<Game | undefined>(() =>
    catalog.games.find((g) => `#game=${g.key}` === window.location.hash),
  );
  const [view, setView] = useState<'detail' | 'evidence' | 'proposal'>('detail');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [issueUrl, setIssueUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const suggestions = useMemo(
    () =>
      search(filters.query)
        .filter(({ game }) => game.confidence === 'confirmed')
        .slice(0, 6),
    [filters.query],
  );
  const results = useMemo(() => {
    const matches = search(filters.query).filter(({ game }) => matchesFilters(game, filters));
    if (!filters.query.trim() || sort !== 'title')
      matches.sort((a, b) =>
        sort === 'time'
          ? (a.game.minutes?.max ?? Infinity) - (b.game.minutes?.max ?? Infinity) ||
            a.game.title.localeCompare(b.game.title)
          : a.game.title.localeCompare(b.game.title),
      );
    return matches;
  }, [filters, sort]);
  const shown = results.slice(0, limit);
  const filterCount =
    filters.tags.length + Number(Boolean(filters.players)) + Number(Boolean(filters.minutes));
  const evidence = selected?.evidence[photoIndex];
  const photo = catalog.photos.find((p) => p.id === evidence?.photoId);
  const related = selected ? similarGames(selected, catalog.games) : [];
  const modalOpen = Boolean(selected || proposal);
  const dropdownOpen = searchOpen && Boolean(filters.query.trim());

  useEffect(() => {
    const node = sentinel.current;
    if (!node || limit >= results.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting)
          setLimit((current) => Math.min(current + 24, results.length));
      },
      { rootMargin: '180px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, results.length]);
  useEffect(() => {
    const onHash = () => {
      setSelected(catalog.games.find((g) => `#game=${g.key}` === window.location.hash));
      setView('detail');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  function updateFilters(next: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...next }));
    setLimit(24);
    setActiveOption(-1);
  }
  function toggleTag(tag: string) {
    updateFilters({
      tags: filters.tags.includes(tag)
        ? filters.tags.filter((t) => t !== tag)
        : [...filters.tags, tag],
    });
  }
  function openGame(game: Game) {
    if (!modalOpen) returnFocus.current = document.activeElement as HTMLElement;
    setSelected(game);
    setView('detail');
    setPhotoIndex(0);
    setSearchOpen(false);
    setProposal(null);
    setCopied(false);
    window.history.replaceState(null, '', `#game=${game.key}`);
    requestAnimationFrame(() => {
      modalRef.current?.scrollTo({ top: 0 });
      if (modalOpen) modalRef.current?.querySelector<HTMLElement>('h2')?.focus();
    });
  }
  function closeModal() {
    if (sending) return;
    setSelected(undefined);
    setProposal(null);
    setMessage('');
    setIssueUrl('');
    setView('detail');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function suggest(game?: Game) {
    if (!modalOpen) returnFocus.current = document.activeElement as HTMLElement;
    setProposal(newProposal(game, catalog.revision));
    setView('proposal');
    setReviewing(false);
    setMessage('');
    setIssueUrl('');
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setMessage('Copy is unavailable in this browser. Use Download instead.');
    }
  }
  function download() {
    if (!proposal) return;
    const url = URL.createObjectURL(new Blob([proposalText(proposal)], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bgt-proposal-${proposal.gameKey || 'new-game'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function submit() {
    if (!proposal || !relay || sending) return;
    setSending(true);
    setMessage('');
    try {
      const response = await fetch(relay, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposal, website: '' }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Could not send. Your draft is still here.');
      setIssueUrl(result.url);
      setMessage('Your suggestion has been sent for review.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not send. Your draft is still here.',
      );
    } finally {
      setSending(false);
    }
  }
  const filterPanel = (
    <>
      <div className="filter-heading">
        <h2>Your group</h2>
        {filterCount > 0 && (
          <button
            className="text-button"
            onClick={() => updateFilters({ players: '', minutes: '', tags: [] })}
          >
            Reset
          </button>
        )}
      </div>
      <label className="field-label" htmlFor="players">
        How many players?
      </label>
      <div className="select-wrap">
        <select
          id="players"
          value={filters.players}
          onChange={(e) => updateFilters({ players: e.target.value })}
        >
          <option value="">Any group size</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'Solo' : `${n} players`}
            </option>
          ))}
        </select>
        <ChevronDown size={15} />
      </div>
      <label className="field-label" htmlFor="minutes">
        Time at the table
      </label>
      <div className="select-wrap">
        <select
          id="minutes"
          value={filters.minutes}
          onChange={(e) => updateFilters({ minutes: e.target.value })}
        >
          <option value="">Any length</option>
          {[15, 30, 45, 60, 90, 120].map((n) => (
            <option key={n} value={n}>
              Up to {n} minutes
            </option>
          ))}
        </select>
        <ChevronDown size={15} />
      </div>
      {(filters.players || filters.minutes) && (
        <p className="filter-note">
          Showing games with checked play details. Times exclude teaching.
        </p>
      )}
      <fieldset className="tag-options">
        <legend>How do you want to play?</legend>
        {(moreTags ? allTags : [...new Set([...popularTags, ...filters.tags])]).map((tag) => (
          <label key={tag}>
            <input
              type="checkbox"
              checked={filters.tags.includes(tag)}
              onChange={() => toggleTag(tag)}
            />
            <span>{tag}</span>
          </label>
        ))}
      </fieldset>
      <button className="text-button more-tags" onClick={() => setMoreTags(!moreTags)}>
        {moreTags ? 'Show fewer tags' : 'Explore all tags'} <ChevronDown size={14} />
      </button>
      {filters.tags.length > 1 && <p className="filter-note">Games match all selected tags.</p>}
      <div className="sidebar-note">
        <span className="tiny-rule" />
        <p>
          A game for the people
          <br />
          around the table.
        </p>
        <span>Explore, play, connect.</span>
      </div>
    </>
  );

  return (
    <>
      <a className="skip-link" href="#games">
        Skip to games
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href={import.meta.env.BASE_URL}
            aria-label="Board Game Therapy game library"
          >
            <span className="brand-mark" aria-hidden="true">
              bgt<span>·</span>
            </span>
            <span className="brand-name">
              Board Game
              <br />
              Therapy
            </span>
          </a>
          <nav aria-label="Main navigation">
            <span className="nav-current">Game library</span>
            <button className="suggest-button" onClick={() => suggest()}>
              <Plus size={16} /> Suggest an update
            </button>
          </nav>
        </div>
      </header>
      <main className="page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">THE GAME LIBRARY</p>
            <h1>What shall we play?</h1>
            <p>Find a game that fits your group, your time, and your way of playing.</p>
          </div>
          <span className="heading-note">
            Good company.
            <br />
            <em>Something to play.</em>
          </span>
        </div>
        <div className="library-layout">
          <aside
            className={`filters ${mobileFilters ? 'filters-open' : ''}`}
            aria-label="Filter games"
          >
            {filterPanel}
          </aside>
          <section id="games" className="catalog" aria-label="Game library" tabIndex={-1}>
            <div className="search-line">
              <div
                className="search-area"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setSearchOpen(false);
                }}
              >
                <div className="search-box">
                  <Search size={19} aria-hidden="true" />
                  <input
                    ref={searchInput}
                    role="combobox"
                    aria-label="Search games"
                    aria-autocomplete="list"
                    aria-controls="search-suggestions"
                    aria-expanded={dropdownOpen}
                    aria-activedescendant={
                      dropdownOpen && activeOption >= 0 ? `suggestion-${activeOption}` : undefined
                    }
                    placeholder="Search a title, theme, or way to play…"
                    value={filters.query}
                    onFocus={() => setSearchOpen(true)}
                    onChange={(e) => {
                      updateFilters({ query: e.target.value });
                      setSearchOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchOpen(false);
                        setActiveOption(-1);
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSearchOpen(true);
                        setActiveOption((current) => Math.min(current + 1, suggestions.length - 1));
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveOption((current) => Math.max(current - 1, 0));
                      }
                      if (e.key === 'Enter' && dropdownOpen && suggestions.length) {
                        e.preventDefault();
                        openGame(suggestions[Math.max(0, activeOption)].game);
                      }
                    }}
                  />
                  {filters.query && (
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => {
                        updateFilters({ query: '' });
                        searchInput.current?.focus();
                      }}
                    >
                      <X size={17} />
                    </button>
                  )}
                </div>
                {dropdownOpen && (
                  <div className="search-dropdown">
                    <div className="dropdown-label">
                      Quick matches <span>Across the collection</span>
                    </div>
                    <ul id="search-suggestions" role="listbox" aria-label="Matching games">
                      {suggestions.map((match, i) => (
                        <li
                          role="option"
                          aria-selected={activeOption === i}
                          id={`suggestion-${i}`}
                          key={match.game.key}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => openGame(match.game)}
                          className={activeOption === i ? 'active' : ''}
                        >
                          <Artwork key={match.game.key} game={match.game} />
                          <span>
                            <strong>
                              <Highlight text={match.game.title} terms={match.terms} />
                            </strong>
                            <small>{match.reason}</small>
                          </span>
                          <ArrowRight size={16} />
                        </li>
                      ))}
                    </ul>
                    {!suggestions.length && (
                      <p className="search-empty">
                        No quick matches. Try a shorter title or a tag like “cooperative”.
                      </p>
                    )}
                    <div className="dropdown-foot">
                      ↑ ↓ to explore · Enter to open · Esc to close
                    </div>
                  </div>
                )}
              </div>
              <button
                className="mobile-filter-button"
                aria-expanded={mobileFilters}
                onClick={() => setMobileFilters(!mobileFilters)}
              >
                <SlidersHorizontal size={18} /> Filters{filterCount > 0 ? ` (${filterCount})` : ''}
              </button>
            </div>
            <div className="collection-toolbar">
              <div className="type-tabs" aria-label="Collection type">
                {[
                  ['game', 'Games'],
                  ['expansion', 'Expansions'],
                  ['all', 'Everything'],
                  ['review', 'To verify'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={filters.kind === value}
                    className={filters.kind === value ? 'selected' : ''}
                    onClick={() => updateFilters({ kind: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="sort">
                <span className="sr-only">Sort games</span>
                <select
                  aria-label="Sort games"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="title">{filters.query ? 'Best match' : 'Title A–Z'}</option>
                  <option value="time">Shortest first</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <div className="result-line">
              <p role="status" aria-live="polite">
                <strong>{results.length}</strong>{' '}
                {filters.kind === 'expansion'
                  ? 'expansions'
                  : filters.kind === 'game'
                    ? 'games'
                    : 'entries'}
                {filterCount > 0 ? ' for your group' : ' to explore'}
                {filters.query && ` matching “${filters.query}”`}
              </p>
              {(filterCount > 0 || filters.query) && (
                <button
                  className="text-button"
                  onClick={() => {
                    setFilters(emptyFilters);
                    setLimit(24);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            {filters.tags.length > 0 && (
              <div className="active-tags">
                {filters.tags.map((tag) => (
                  <button onClick={() => toggleTag(tag)} key={tag}>
                    {tag}
                    <X size={12} />
                    <span className="sr-only">Remove filter</span>
                  </button>
                ))}
              </div>
            )}
            {results.length === 0 ? (
              <div className="empty-state">
                <Search size={30} />
                <h2>No games fit just yet.</h2>
                <p>Try a different player count, a little more time, or fewer tags.</p>
                <button
                  className="primary-button"
                  onClick={() => {
                    setFilters(emptyFilters);
                    setLimit(24);
                  }}
                >
                  Show all games
                </button>
              </div>
            ) : (
              <div className="game-grid">
                {shown.map(({ game, terms, reason }) => (
                  <button
                    className="game-card"
                    key={game.key}
                    onClick={() => openGame(game)}
                    aria-label={`View ${game.title}`}
                  >
                    <Artwork game={game} />
                    <div className="card-copy">
                      <div className="card-title">
                        <h2>
                          <Highlight text={game.title} terms={terms} />
                        </h2>
                        <ArrowRight size={15} aria-hidden="true" />
                      </div>
                      <Facts game={game} />
                      <p className="game-summary">{game.summary}</p>
                      <div className="tags">
                        {game.kind !== 'game' && (
                          <span className="kind-tag">{kinds[game.kind]}</span>
                        )}
                        {game.confidence === 'uncertain' && (
                          <span className="uncertain-tag">Needs verification</span>
                        )}
                        {game.tags.slice(0, 3).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                        {game.tags.length > 3 && (
                          <span className="extra-tags">+{game.tags.length - 3}</span>
                        )}
                      </div>
                      {reason && <small className="match-reason">{reason}</small>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {limit < results.length && (
              <div className="load-more" ref={sentinel}>
                <button className="secondary-button" onClick={() => setLimit((n) => n + 24)}>
                  Show more games <ChevronDown size={15} />
                </button>
                <span>
                  {shown.length} of {results.length}
                </span>
              </div>
            )}
            {results.length > 0 && limit >= results.length && (
              <p className="end-note">You’ve reached the end of this selection.</p>
            )}
          </section>
        </div>
        <footer className="site-footer">
          <div>
            <strong>Board Game Therapy</strong>
            <span>Purposeful play, conversation, and connection.</span>
          </div>
          <button className="text-button" onClick={() => suggest()}>
            Something missing? Suggest an update <ArrowRight size={14} />
          </button>
        </footer>
      </main>
      <Dialog.Root
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content
            ref={modalRef}
            className={`modal modal-${view}`}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              returnFocus.current?.focus();
            }}
            onEscapeKeyDown={(e) => {
              if (sending) e.preventDefault();
            }}
          >
            <Dialog.Close
              className="modal-close icon-button"
              aria-label="Close dialog"
              disabled={sending}
            >
              <X size={20} />
            </Dialog.Close>
            {view === 'detail' && selected && (
              <>
                <div className="detail-top">
                  <Artwork key={selected.key} game={selected} large />
                  <div>
                    <p className="eyebrow">
                      {kinds[selected.kind]}
                      {selected.confidence === 'uncertain' ? ' · Identification to verify' : ''}
                    </p>
                    <Dialog.Title tabIndex={-1}>{selected.title}</Dialog.Title>
                    <Dialog.Description>{selected.summary}</Dialog.Description>
                    <Facts game={selected} full />
                  </div>
                </div>
                <div className="detail-body">
                  <p className="detail-description">{selected.description}</p>
                  <div className="tags detail-tags">
                    {selected.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  {selected.kind === 'expansion' && (
                    <p className="inline-note">
                      An expansion may need its matching base game. Check compatibility before
                      choosing.
                    </p>
                  )}
                  <div className="detail-links">
                    <button
                      className="secondary-button small-button"
                      onClick={() => {
                        setView('evidence');
                        setPhotoIndex(0);
                      }}
                    >
                      <Camera size={14} /> Collection evidence
                      {selected.evidence.length > 0 && ` (${selected.evidence.length})`}
                    </button>
                    {selected.reference && (
                      <a href={selected.reference.url} target="_blank" rel="noreferrer">
                        Game reference <ExternalLink size={13} />
                      </a>
                    )}
                    <button className="text-button" onClick={() => suggest(selected)}>
                      Suggest a correction
                    </button>
                  </div>
                  {selected.image && (
                    <p className="image-credit">
                      {selected.image.credit}. Play details are reference values; editions and
                      groups can differ.
                    </p>
                  )}
                  {related.length > 0 && (
                    <section className="similar">
                      <h3>Keep exploring</h3>
                      <p>More games with something in common.</p>
                      <div className="similar-grid">
                        {related.map(({ game, shared }) => (
                          <button key={game.key} onClick={() => openGame(game)}>
                            <Artwork game={game} />
                            <strong>{game.title}</strong>
                            <small>{shared.slice(0, 2).join(' · ')}</small>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </>
            )}
            {view === 'evidence' && selected && (
              <>
                <button className="back-button" onClick={() => setView('detail')}>
                  <ArrowLeft size={16} /> Back to game
                </button>
                <Dialog.Title>Collection evidence</Dialog.Title>
                <Dialog.Description>
                  {selected.title} ·{' '}
                  {selected.evidence.length
                    ? 'The outlined area shows the box used for this identification.'
                    : 'No photo has been linked to this entry yet.'}
                </Dialog.Description>
                {selected.evidence.length > 1 && (
                  <div className="photo-tabs" aria-label="Evidence images">
                    {selected.evidence.map((item, i) => (
                      <button
                        key={`${item.photoId}-${i}`}
                        aria-pressed={photoIndex === i}
                        className={photoIndex === i ? 'selected' : ''}
                        onClick={() => setPhotoIndex(i)}
                      >
                        Photo {i + 1}
                      </button>
                    ))}
                  </div>
                )}
                {photo && evidence && (
                  <figure className="evidence-figure">
                    <div
                      className="evidence-photo"
                      style={{
                        aspectRatio: `${photo.width}/${photo.height}`,
                        width: `min(100%, ${(58 * photo.width) / photo.height}dvh)`,
                      }}
                    >
                      <img
                        src={assets(photo.src)}
                        alt={`${selected.title} outlined in ${photo.label}`}
                      />
                      <span
                        className="photo-region"
                        style={{
                          left: `${evidence.region.x * 100}%`,
                          top: `${evidence.region.y * 100}%`,
                          width: `${evidence.region.width * 100}%`,
                          height: `${evidence.region.height * 100}%`,
                        }}
                      >
                        <span>Box {photoIndex + 1}</span>
                      </span>
                    </div>
                    <figcaption>
                      {photo.label}
                      <a href={assets(photo.src)} target="_blank" rel="noreferrer">
                        Full resolution <ExternalLink size={12} />
                      </a>
                    </figcaption>
                  </figure>
                )}
                {selected.notes && <p className="inline-note">{selected.notes}</p>}
                <p className="evidence-note">
                  A photo records a sighting, not a live availability check or a count of copies.
                </p>
                <button className="text-button" onClick={() => suggest(selected)}>
                  Report an identification or region issue
                </button>
              </>
            )}
            {view === 'proposal' && proposal && (
              <>
                {selected && !issueUrl && (
                  <button
                    className="back-button"
                    disabled={sending}
                    onClick={() => {
                      setProposal(null);
                      setView('detail');
                    }}
                  >
                    <ArrowLeft size={16} /> Back to game
                  </button>
                )}
                <Dialog.Title>
                  {issueUrl
                    ? 'Thank you for helping.'
                    : reviewing
                      ? 'Review your suggestion'
                      : selected
                        ? 'Suggest a correction'
                        : 'Suggest an update'}
                </Dialog.Title>
                <Dialog.Description>
                  {issueUrl
                    ? 'A maintainer will review the proposal before changing the catalog.'
                    : 'Help keep the library useful. No account or name needed.'}
                </Dialog.Description>
                {issueUrl ? (
                  <div className="submission-success">
                    <Check size={28} />
                    <p role="status">{message}</p>
                    <a className="primary-button" href={issueUrl} target="_blank" rel="noreferrer">
                      View your suggestion <ExternalLink size={15} />
                    </a>
                  </div>
                ) : reviewing ? (
                  <>
                    <pre className="proposal-preview">{proposalText(proposal)}</pre>
                    <p className="inline-note">
                      This suggestion will be public on GitHub. Do not include names, contact
                      details, or photos of people.
                    </p>
                    <div className="proposal-actions">
                      <button
                        className="secondary-button"
                        disabled={sending}
                        onClick={() => setReviewing(false)}
                      >
                        Keep editing
                      </button>
                      {relay ? (
                        <button
                          className="primary-button"
                          disabled={sending}
                          onClick={() => void submit()}
                        >
                          {sending ? 'Sending…' : 'Send anonymously'} <ArrowRight size={15} />
                        </button>
                      ) : (
                        <button className="primary-button" onClick={download}>
                          <Download size={15} /> Download suggestion
                        </button>
                      )}
                    </div>
                    {!relay && (
                      <p className="inline-note">
                        Online submission is being connected. Download your suggestion and share it
                        with a facilitator.
                      </p>
                    )}
                    <div className="draft-tools">
                      <button
                        className="text-button"
                        onClick={() => void copy(proposalText(proposal))}
                      >
                        <Copy size={13} /> {copied ? 'Copied' : 'Copy draft'}
                      </button>
                      <button className="text-button" onClick={download}>
                        <Download size={13} /> Download
                      </button>
                    </div>
                    {message && (
                      <p className="form-message" role="alert">
                        {message}
                      </p>
                    )}
                  </>
                ) : (
                  <form
                    className="proposal-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setReviewing(true);
                      setMessage('');
                    }}
                  >
                    <label>
                      Game title
                      <input
                        required
                        maxLength={200}
                        value={proposal.title}
                        onChange={(e) => setProposal({ ...proposal, title: e.target.value })}
                        placeholder="Which game?"
                      />
                    </label>
                    <label>
                      What needs updating?
                      <select
                        value={proposal.category}
                        onChange={(e) => setProposal({ ...proposal, category: e.target.value })}
                      >
                        {[
                          'Add a game',
                          'Game details',
                          'Player count or play time',
                          'Tags',
                          'Photo or identification',
                          'Other',
                        ].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Your suggestion
                      <textarea
                        required
                        minLength={10}
                        maxLength={3000}
                        rows={4}
                        value={proposal.details}
                        onChange={(e) => setProposal({ ...proposal, details: e.target.value })}
                        placeholder={
                          selected
                            ? 'What should change, and how can we check it?'
                            : 'Tell us about the game and where it was seen in the collection.'
                        }
                      />
                    </label>
                    <label>
                      Public photo or reference link <span className="optional">(optional)</span>
                      <input
                        type="url"
                        pattern="https://.*"
                        maxLength={500}
                        value={proposal.photoUrl}
                        onChange={(e) => setProposal({ ...proposal, photoUrl: e.target.value })}
                        placeholder="https://…"
                      />
                    </label>
                    <p className="form-hint">
                      Use a publicly accessible link. Photos are not uploaded by this form.
                    </p>
                    <button className="primary-button" type="submit">
                      Review suggestion <ArrowRight size={15} />
                    </button>
                  </form>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
