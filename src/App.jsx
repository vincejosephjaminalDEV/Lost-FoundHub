import { useEffect, useMemo, useState } from "react";
import {
  Package, Home, Search, ClipboardList, MessageCircle, Plus,
  MapPin, CalendarDays, ImagePlus, Send, X, CheckCircle,
  AlertCircle, Clock, Trash2, UserRound, ArrowLeft, RefreshCw
} from "lucide-react";

const API = "/api";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "";

async function request(url, options = {}) {
  const response = await fetch(`${API}${url}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const imageUrl = (path) => path ? `${path}` : "";

export default function App() {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState("");
  const [reports, setReports] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [page, setPage] = useState("Home");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showReportForm, setShowReportForm] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [messageImage, setMessageImage] = useState(null);
  const [reportPhoto, setReportPhoto] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ type: "Lost", name: "", category: "Electronics", color: "", location: "", date: today(), description: "" });

  const currentUser = users.find(u => String(u.id) === String(userId));
  const myReports = reports.filter(r => String(r.userId) === String(userId));
  const activeReports = reports.filter(r => !["Returned", "Closed"].includes(r.status));
  const filteredReports = useMemo(() => {
    const base = page === "My Reports" ? myReports : activeReports;
    return base.filter(r => {
      const haystack = [r.name, r.category, r.color, r.location, r.description, r.ownerName].join(" ").toLowerCase();
      return haystack.includes(search.toLowerCase()) &&
        (typeFilter === "All" || r.type === typeFilter) &&
        (categoryFilter === "All" || r.category === categoryFilter);
    });
  }, [page, myReports, activeReports, search, typeFilter, categoryFilter]);

  async function refreshAll() {
    try {
      const [newReports, newConversations] = await Promise.all([
        request("/reports"),
        request(`/conversations?userId=${userId}`)
      ]);
      setReports(newReports);
      setConversations(newConversations);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    request("/users")
      .then(list => {
        setUsers(list);
        const saved = localStorage.getItem("foundit-demo-user");
        const chosen = list.find(u => String(u.id) === saved) || list[0];
        if (chosen) setUserId(String(chosen.id));
      })
      .catch(e => setError(`${e.message} Is the server running?`));
  }, []);

  useEffect(() => {
    if (!userId) return;
    localStorage.setItem("foundit-demo-user", String(userId));
    refreshAll();
  }, [userId]);

  useEffect(() => {
    if (!selectedConversation || !userId) return;
    request(`/conversations/${selectedConversation.id}/messages?userId=${userId}`)
      .then(setMessages)
      .catch(e => setError(e.message));
  }, [selectedConversation, userId]);

  function navigate(next) {
    setPage(next);
    setSelectedConversation(null);
    setError("");
    setNotice("");
    setSearch("");
    setTypeFilter("All");
    setCategoryFilter("All");
  }

  function startReport(type) {
    setForm({ type, name: "", category: "Electronics", color: "", location: "", date: today(), description: "" });
    setReportPhoto(null);
    setError("");
    setShowReportForm(true);
  }

  async function submitReport(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      Object.entries({ ...form, userId }).forEach(([key, value]) => body.append(key, value));
      if (reportPhoto) body.append("photo", reportPhoto);
      await request("/reports", { method: "POST", body });
      setShowReportForm(false);
      setNotice("Your report has been saved to the SQLite database.");
      setPage("My Reports");
      await refreshAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteReport(report) {
    if (!window.confirm(`Delete your report "${report.name}"?`)) return;
    setError("");
    try {
      await request(`/reports/${report.id}?userId=${userId}`, { method: "DELETE" });
      setNotice("Your report was deleted.");
      await refreshAll();
    } catch (e) {
      setError(e.message);
    }
  }

  async function startConversation(report) {
    setError("");
    try {
      const result = await request("/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, claimantId: Number(userId) })
      });
      await refreshAll();
      const conversation = { id: result.id, reportId: report.id, reportName: report.name, reportType: report.type, claimantId: Number(userId), finderId: report.userId, claimantName: currentUser.name, finderName: report.ownerName, status: "Pending" };
      setSelectedConversation(conversation);
      setPage("Messages");
    } catch (e) {
      setError(e.message);
    }
  }

  async function openConversation(conversation) {
    setSelectedConversation(conversation);
    setPage("Messages");
    setError("");
    try {
      setMessages(await request(`/conversations/${conversation.id}/messages?userId=${userId}`));
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!messageText.trim() && !messageImage) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("senderId", userId);
      body.append("text", messageText);
      if (messageImage) body.append("image", messageImage);
      const message = await request(`/conversations/${selectedConversation.id}/messages`, { method: "POST", body });
      setMessages(previous => [...previous, message]);
      setMessageText("");
      setMessageImage(null);
      const input = document.getElementById("chat-image");
      if (input) input.value = "";
      await refreshAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function decideClaim(decision) {
    setError("");
    try {
      await request(`/conversations/${selectedConversation.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(userId), decision })
      });
      setNotice(`Claim status updated: ${decision}.`);
      await openConversation({ ...selectedConversation, status: decision });
      await refreshAll();
    } catch (e) {
      setError(e.message);
    }
  }

  async function confirmReturned() {
    setError("");
    try {
      await request(`/conversations/${selectedConversation.id}/returned`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(userId) })
      });
      setNotice("Return confirmation recorded.");
      await openConversation({ ...selectedConversation, status: "Returned" });
      await refreshAll();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!currentUser) {
    return <div className="loading">Loading FoundIt…</div>;
  }

  const selectedIsFinder = selectedConversation && Number(userId) === Number(selectedConversation.finderId);
  const selectedIsClaimant = selectedConversation && Number(userId) === Number(selectedConversation.claimantId);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("Home")}><Package size={25} /> Lost&FoundHub</button>
        <nav className="nav">
          <NavItem active={page === "Home"} onClick={() => navigate("Home")} icon={<Home size={17} />}>Home</NavItem>
          <NavItem active={page === "Browse"} onClick={() => navigate("Browse")} icon={<Search size={17} />}>Browse</NavItem>
          <NavItem active={page === "My Reports"} onClick={() => navigate("My Reports")} icon={<ClipboardList size={17} />}>My Reports</NavItem>
          <NavItem active={page === "Inbox" || page === "Messages"} onClick={() => navigate("Inbox")} icon={<MessageCircle size={17} />}>Messages <span className="count">{conversations.length}</span></NavItem>
        </nav>
        <label className="user-switcher">
          <UserRound size={17} />
          <select value={userId} onChange={e => { setUserId(e.target.value); setSelectedConversation(null); setPage("Home"); setNotice(""); }} aria-label="Switch demo user">
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      </header>

      <main className="main">
        {error && <div className="alert error"><AlertCircle size={18} /> <span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        {notice && <div className="alert success"><CheckCircle size={18} /> <span>{notice}</span><button onClick={() => setNotice("")}><X size={16} /></button></div>}

        {page === "Home" && <>
          <div className="welcome">
            <p className="eyebrow">NORMAL USER DASHBOARD · DEMO ACCOUNT</p>
            <h1>Welcome, {currentUser.name}!</h1>
            <p>Report lost or found items, talk privately, and provide image evidence to help verify ownership.</p>
            <div className="button-row">
              <button className="btn primary" onClick={() => startReport("Lost")}><Plus size={17} /> Report lost item</button>
              <button className="btn secondary" onClick={() => startReport("Found")}><Plus size={17} /> Report found item</button>
            </div>
          </div>
          <div className="stats">
            <Stat label="My active reports" value={myReports.filter(r => !["Returned", "Closed"].includes(r.status)).length} icon={<ClipboardList />} />
            <Stat label="My conversations" value={conversations.length} icon={<MessageCircle />} />
            <Stat label="Active campus reports" value={activeReports.length} icon={<Package />} />
          </div>
          <section className="panel">
            <div className="section-heading"><div><h2>Recently reported items</h2><p>Start a private claim conversation on a Found report.</p></div><button className="text-button" onClick={() => navigate("Browse")}>Browse all</button></div>
            <ReportGrid reports={activeReports.slice(0, 4)} userId={Number(userId)} onClaim={startConversation} onDelete={deleteReport} />
          </section>
        </>}

        {(page === "Browse" || page === "My Reports") && <>
          <div className="page-heading"><div><p className="eyebrow">ITEM DIRECTORY</p><h1>{page === "Browse" ? "Browse items" : "My reports"}</h1><p>{page === "Browse" ? "Search reports and contact the finder privately." : "Manage reports you submitted from this demo account."}</p></div>{page === "My Reports" && <button className="btn primary" onClick={() => startReport("Lost")}><Plus size={17} /> New report</button>}</div>
          <div className="filters">
            <div className="searchbox"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item, location, or details" /></div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option>All</option><option>Lost</option><option>Found</option></select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option>All</option>{["Electronics","Accessories","Personal Items","Clothing","School Supplies","Other"].map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <section className="panel"><div className="section-heading"><div><h2>{filteredReports.length} report(s)</h2><p>Reports are saved in the local SQLite database.</p></div><button className="icon-button" title="Refresh" onClick={refreshAll}><RefreshCw size={17} /></button></div><ReportGrid reports={filteredReports} userId={Number(userId)} onClaim={startConversation} onDelete={deleteReport} /></section>
        </>}

        {page === "Inbox" && <>
          <div className="page-heading"><div><p className="eyebrow">PRIVATE CONVERSATIONS</p><h1>Messages</h1><p>Chat with claimants or finders and review image evidence.</p></div></div>
          <section className="panel">
            {conversations.length === 0 ? <EmptyState title="No conversations yet" detail="Browse found items and start a conversation to claim a possible match." /> : <div className="conversation-list">{conversations.map(c => <button className="conversation-row" key={c.id} onClick={() => openConversation(c)}><div className="conversation-avatar"><MessageCircle /></div><div className="conversation-info"><strong>{c.reportName}</strong><span>{Number(userId) === c.finderId ? `Claimant: ${c.claimantName}` : `Finder: ${c.finderName}`}</span><small>{c.lastMessage || "No messages yet"}</small></div><div className="conversation-meta"><Status value={c.status} /><span>Open chat →</span></div></button>)}</div>}
          </section>
        </>}

        {page === "Messages" && selectedConversation && <>
          <button className="back-button" onClick={() => navigate("Inbox")}><ArrowLeft size={17} /> Back to messages</button>
          <section className="chat-panel">
            <div className="chat-header"><div><h2>{selectedConversation.reportName}</h2><p>{selectedIsFinder ? `Claimant: ${selectedConversation.claimantName}` : `Finder: ${selectedConversation.finderName}`}</p></div><Status value={selectedConversation.status} /></div>
            <div className="chat-safety"><AlertCircle size={17} /><span>Ask for details the public report does not reveal. Do not share passwords, PINs, or sensitive identity documents.</span></div>
            <div className="messages">
              {messages.map(m => <div key={m.id} className={`message-line ${m.senderId === Number(userId) ? "mine" : "theirs"} ${m.type === "system" ? "system-line" : ""}`}>
                <div className="message-bubble">
                  {m.type === "system" && <div className="system-label">FoundIt update</div>}
                  {m.text && <p>{m.text}</p>}
                  {m.image && <a href={imageUrl(m.image)} target="_blank" rel="noreferrer" className="evidence-link"><img src={imageUrl(m.image)} alt="User-submitted evidence" /><span><ImagePlus size={14} /> {m.type === "evidence" ? "Image evidence" : "Image attachment"} · Open image</span></a>}
                  <small>{m.senderName} · {new Date(m.createdAt + (m.createdAt.endsWith("Z") ? "" : "Z")).toLocaleString()}</small>
                </div>
              </div>)}
              {messages.length === 0 && <EmptyState title="Start the conversation" detail="Describe the item and ask questions to help verify ownership." />}
            </div>
            {selectedConversation.status !== "Rejected" && selectedConversation.status !== "Returned" && <form className="composer" onSubmit={sendMessage}>
              {messageImage && <div className="image-preview"><img src={URL.createObjectURL(messageImage)} alt="Selected evidence preview" /><span>{messageImage.name}</span><button type="button" onClick={() => setMessageImage(null)}><X size={15} /></button></div>}
              <textarea value={messageText} onChange={e => setMessageText(e.target.value)} placeholder="Write a message or describe your proof…" rows={2} />
              <div className="composer-actions"><label className="btn secondary file-button"><ImagePlus size={17} /> Attach image<input id="chat-image" type="file" accept="image/*" onChange={e => setMessageImage(e.target.files?.[0] || null)} /></label><span className="hint">Images up to 5 MB</span><button className="btn primary" disabled={busy || (!messageText.trim() && !messageImage)}><Send size={16} /> Send</button></div>
            </form>}
            {selectedIsFinder && ["Pending", "More Proof Requested"].includes(selectedConversation.status) && <div className="decision-box"><h3>Review this ownership claim</h3><p>Check the claimant's description and any image evidence before deciding.</p><div className="button-row"><button className="btn primary" onClick={() => decideClaim("Approved")}>Approve claim</button><button className="btn secondary" onClick={() => decideClaim("More Proof Requested")}>Request more proof</button><button className="btn danger" onClick={() => decideClaim("Rejected")}>Reject claim</button></div></div>}
            {selectedConversation.status === "Approved" && <div className="decision-box"><h3>Claim approved</h3><p>Coordinate a safe handover. Confirm only after the item has actually been returned.</p><button className="btn primary" onClick={confirmReturned}><CheckCircle size={17} /> Confirm item returned</button></div>}
            {selectedConversation.status === "Rejected" && <div className="status-note"><AlertCircle size={18} /> This claim was rejected by the finder.</div>}
            {selectedConversation.status === "Returned" && <div className="status-note"><CheckCircle size={18} /> Return confirmed. This conversation is complete.</div>}
          </section>
        </>}

        {page === "Messages" && !selectedConversation && <EmptyState title="Choose a conversation" detail="Go to Messages and select a conversation." />}
      </main>

      {showReportForm && <div className="modal-backdrop"><section className="modal"><div className="modal-heading"><div><h2>Report an item</h2><p>Submit details to the FoundIt database.</p></div><button className="icon-button" onClick={() => setShowReportForm(false)}><X /></button></div>
        <form className="report-form" onSubmit={submitReport}>
          <Field label="Report type"><select value={form.type} onChange={e => setForm({...form, type:e.target.value})}><option>Lost</option><option>Found</option></select></Field>
          <Field label="Item name"><input required value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="e.g. Black smartphone" /></Field>
          <div className="two-fields"><Field label="Category"><select value={form.category} onChange={e => setForm({...form, category:e.target.value})}>{["Electronics","Accessories","Personal Items","Clothing","School Supplies","Other"].map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Color"><input required value={form.color} onChange={e => setForm({...form, color:e.target.value})} placeholder="e.g. Black" /></Field></div>
          <Field label="Location"><input required value={form.location} onChange={e => setForm({...form, location:e.target.value})} placeholder="e.g. University canteen" /></Field>
          <Field label="Date lost or found"><input required type="date" max={today()} value={form.date} onChange={e => setForm({...form, date:e.target.value})} /></Field>
          <Field label="Description"><textarea required rows={3} value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Include useful details, but keep unique identifying details private." /></Field>
          <Field label="Item photo (optional)"><input type="file" accept="image/*" onChange={e => setReportPhoto(e.target.files?.[0] || null)} />{reportPhoto && <span className="hint">{reportPhoto.name}</span>}</Field>
          <p className="form-note">Don't include passwords, PINs, student numbers, or private documents in photos.</p>
          <div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setShowReportForm(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Submit report"}</button></div>
        </form>
      </section></div>}
    </div>
  );
}

function NavItem({ active, onClick, icon, children }) {
  return <button onClick={onClick} className={`nav-item ${active ? "active" : ""}`}>{icon}{children}</button>;
}
function Stat({ label, value, icon }) {
  return <div className="stat-card"><div className="stat-label">{label}{icon}</div><strong>{value}</strong></div>;
}
function Status({ value }) {
  const cls = value === "Approved" || value === "Returned" ? "green" : value === "Rejected" ? "red" : value === "More Proof Requested" ? "amber" : "blue";
  return <span className={`status ${cls}`}>{value}</span>;
}
function ReportGrid({ reports, userId, onClaim, onDelete }) {
  if (!reports.length) return <EmptyState title="No reports found" detail="Try changing your filters or submit a report." />;
  return <div className="report-grid">{reports.map(r => <article className="report-card" key={r.id}>
    {r.photo ? <img className="report-photo" src={imageUrl(r.photo)} alt={r.name} /> : <div className="report-placeholder"><Package size={30} /></div>}
    <div className="report-card-body"><div className="report-badges"><span className={`type-badge ${r.type.toLowerCase()}`}>{r.type}</span><Status value={r.status} /></div><h3>{r.name}</h3><p className="muted">{r.category} · {r.color}</p><p className="description">{r.description}</p><div className="report-meta"><span><MapPin size={14} />{r.location}</span><span><CalendarDays size={14} />{formatDate(r.date)}</span></div><div className="report-owner">Posted by {r.ownerName}</div>
      <div className="card-actions">{r.type === "Found" && r.userId !== userId && !["Approved","Returned","Closed"].includes(r.status) && <button className="btn primary small" onClick={() => onClaim(r)}><MessageCircle size={15} /> Message finder</button>}{r.userId === userId && <button className="btn secondary small" onClick={() => onDelete(r)}><Trash2 size={15} /> Delete my report</button>}</div>
    </div>
  </article>)}</div>;
}
function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function EmptyState({ title, detail }) {
  return <div className="empty-state"><Package size={34} /><strong>{title}</strong><p>{detail}</p></div>;
}
