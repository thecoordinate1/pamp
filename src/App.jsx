import { useState, useRef } from 'react';
import Navbar from './components/Navbar';
import PartyCard from './components/PartyCard';
import PostPartyForm from './components/PostPartyForm';
import FacecardSection from './components/FacecardSection';
import partiesData from './data/parties';
import facecardData from './data/facecardRequests';

export default function App() {
  const [parties, setParties] = useState(partiesData);
  const [rsvps, setRsvps] = useState(new Set());
  const [facecardRequests, setFacecardRequests] = useState(facecardData);
  const [activeSection, setActiveSection] = useState('hero');
  const [searchQuery, setSearchQuery] = useState('');
  const [vibeFilter, setVibeFilter] = useState('all');

  const heroRef = useRef(null);
  const browseRef = useRef(null);
  const postRef = useRef(null);
  const facecardRef = useRef(null);

  const scrollTo = (id) => {
    const refs = { hero: heroRef, browse: browseRef, post: postRef, facecard: facecardRef };
    refs[id]?.current?.scrollIntoView({ behavior: 'smooth' });
    setActiveSection(id);
  };

  const handleRSVP = (partyId) => {
    setRsvps(prev => {
      const next = new Set(prev);
      if (next.has(partyId)) {
        next.delete(partyId);
        setParties(p => p.map(party => party.id === partyId ? { ...party, rsvpCount: party.rsvpCount - 1 } : party));
      } else {
        next.add(partyId);
        setParties(p => p.map(party => party.id === partyId ? { ...party, rsvpCount: party.rsvpCount + 1 } : party));
      }
      return next;
    });
  };

  const handlePostParty = (newParty) => {
    setParties(prev => [newParty, ...prev]);
    scrollTo('browse');
  };

  const handleFacecardUpdate = (requestId, newStatus) => {
    setFacecardRequests(prev =>
      prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r)
    );
  };

  const handleNewFacecard = (newRequest) => {
    setFacecardRequests(prev => [newRequest, ...prev]);
  };

  const handleFacecardFromCard = (party) => {
    scrollTo('facecard');
  };

  // Filtered parties
  const vibes = [...new Set(parties.map(p => p.vibe))];
  const filteredParties = parties.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.vibe.toLowerCase().includes(searchQuery.toLowerCase());
    const matchVibe = vibeFilter === 'all' || p.vibe === vibeFilter;
    return matchSearch && matchVibe;
  });

  return (
    <div className="min-h-screen">
      <Navbar activeSection={activeSection} onNavigate={scrollTo} />

      {/* ============ HERO ============ */}
      <section ref={heroRef} className="pt-24 pb-16 md:pt-32 md:pb-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Glowing circle */}
          <div className="relative inline-block mb-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
              style={{ background: 'linear-gradient(135deg, #E040FB, #7C4DFF)', boxShadow: '0 0 60px rgba(224,64,251,0.3)' }}>
              🎊
            </div>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-4 leading-tight">
            Party At <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, #E040FB, #7C4DFF, #00E5FF)' }}>My Place</span>
          </h1>

          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-8">
            Zambia's hottest party discovery platform. Find the vibes, post the event, or secure your exclusive invite.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => scrollTo('browse')} className="btn-accent text-base px-8 py-3.5">
              🔥 Browse Parties
            </button>
            <button onClick={() => scrollTo('post')} className="btn-outline text-base px-8 py-3.5">
              🎉 Post a Party
            </button>
          </div>

          {/* Stats */}
          <div className="flex justify-center gap-8 md:gap-12 mt-12">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-black text-accent">{parties.length}</div>
              <div className="text-xs text-text-muted mt-1">Active Parties</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-black text-cyan">{parties.reduce((sum, p) => sum + p.rsvpCount, 0)}+</div>
              <div className="text-xs text-text-muted mt-1">RSVPs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-black text-amber">{facecardRequests.length}</div>
              <div className="text-xs text-text-muted mt-1">Facecard Requests</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ BROWSE ============ */}
      <section ref={browseRef} id="browse" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="section-title">🔥 What's Popping</h2>
            <p className="section-subtitle">Find your next turn-up</p>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search parties, areas, vibes..."
                className="input-dark pl-11"
              />
            </div>
            <select
              value={vibeFilter}
              onChange={(e) => setVibeFilter(e.target.value)}
              className="input-dark sm:w-48"
            >
              <option value="all">All Vibes</option>
              {vibes.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Party Grid */}
          {filteredParties.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">😭</p>
              <p className="text-text-secondary">No parties match your search. Try a different vibe!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredParties.map((party, i) => (
                <div key={party.id} style={{ animationDelay: `${i * 0.08}s` }}>
                  <PartyCard
                    party={party}
                    onRSVP={handleRSVP}
                    isRSVPed={rsvps.has(party.id)}
                    onFacecard={handleFacecardFromCard}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============ POST A PARTY ============ */}
      <section ref={postRef} id="post" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="section-title">🎉 Post Your Party</h2>
            <p className="section-subtitle">Put your event on the map</p>
          </div>
          <PostPartyForm onSubmit={handlePostParty} />
        </div>
      </section>

      {/* ============ FACECARD ============ */}
      <section ref={facecardRef} id="facecard" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="section-title">📸 Facecard</h2>
            <p className="section-subtitle">Show your face, get the place</p>
          </div>
          <FacecardSection
            parties={parties}
            facecardRequests={facecardRequests}
            onUpdateRequest={handleFacecardUpdate}
            onNewRequest={handleNewFacecard}
          />
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
              style={{ background: 'linear-gradient(135deg, #E040FB, #7C4DFF)' }}>
              P
            </div>
            <span className="font-bold text-sm">
              PAM<span className="text-accent">P</span>
            </span>
          </div>
          <p className="text-text-muted text-sm text-center">
            Made with 💜 in Lusaka, Zambia · © 2026 PAMP
          </p>
          <div className="flex gap-4 text-text-muted text-sm">
            <a href="#" className="hover:text-accent transition">Instagram</a>
            <a href="#" className="hover:text-accent transition">TikTok</a>
            <a href="#" className="hover:text-accent transition">WhatsApp</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
