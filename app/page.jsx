"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  BadgeCheck,
  Check,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  LogOut,
  QrCode,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  WalletCards,
  X,
} from "lucide-react"
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth"
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore"
import { auth, db, googleProvider } from "@/lib/firebase"

const PAYMENT_DOC = "payment"
const MAX_QR_BYTES = 320_000

function money(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function readableDate(value) {
  if (!value) return "—"
  const date = value?.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

function getTotal(booking) {
  if (Number(booking.paidAmount || booking.totalPrice || 0) > 0) {
    return Number(booking.paidAmount || booking.totalPrice)
  }
  const start = new Date(`${booking.checkIn || ""}T00:00:00`)
  const end = new Date(`${booking.checkOut || ""}T00:00:00`)
  const nights = Math.max(1, Math.ceil((end - start) / 86_400_000))
  return Number(booking.pricePerNight || 0) * nights
}

export default function PaymentsPage() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [bookings, setBookings] = useState([])
  const [paymentSettings, setPaymentSettings] = useState({ gcashQrUrl: "", instructions: "" })
  const [ownerName, setOwnerName] = useState("")
  const [ownerApproved, setOwnerApproved] = useState(false)
  const [view, setView] = useState("payments")
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [selectedProof, setSelectedProof] = useState(null)
  const [busyBookingId, setBusyBookingId] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser)
    setAuthReady(true)
  }), [])

  useEffect(() => {
    if (!user) {
      setBookings([])
      return undefined
    }
    const bookingsQuery = query(collection(db, "guestbooking"), where("ownerUid", "==", user.uid))
    return onSnapshot(bookingsQuery, (snapshot) => {
      const rows = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0)
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0)
          return dateB - dateA
        })
      setBookings(rows)
    }, (snapshotError) => setError(snapshotError.message))
  }, [user])

  useEffect(() => {
    if (!user) {
      setPaymentSettings({ gcashQrUrl: "", instructions: "" })
      return undefined
    }
    const stopSettings = onSnapshot(doc(db, "resortOwners", user.uid, "site", PAYMENT_DOC), (snapshot) => {
      const values = snapshot.exists() ? snapshot.data() : {}
      setPaymentSettings({
        gcashQrUrl: String(values.gcashQrUrl || ""),
        instructions: String(values.instructions || ""),
      })
    }, (snapshotError) => setError(snapshotError.message))
    const stopOwner = onSnapshot(doc(db, "resortOwners", user.uid), (snapshot) => {
      const owner = snapshot.exists() ? snapshot.data() : {}
      setOwnerApproved(String(owner.status || "").toLowerCase() === "approved")
      setOwnerName(String(owner.resortName || owner.name || user.displayName || "My resort"))
    }, (snapshotError) => setError(snapshotError.message))
    return () => {
      stopSettings()
      stopOwner()
    }
  }, [user])

  const pendingBookings = bookings.filter((booking) => booking.paymentStatus !== "paid")
  const paidBookings = bookings.filter((booking) => booking.paymentStatus === "paid")
  const filteredBookings = useMemo(() => bookings.filter((booking) => {
    const matchesStatus = filter === "all" || (filter === "pending" ? booking.paymentStatus !== "paid" : booking.paymentStatus === "paid")
    const searchText = `${booking.name || ""} ${booking.email || ""} ${booking.roomType || ""} ${booking.id}`.toLowerCase()
    return matchesStatus && searchText.includes(search.trim().toLowerCase())
  }), [bookings, filter, search])
  const paidTotal = paidBookings.reduce((sum, booking) => sum + getTotal(booking), 0)

  async function savePaymentSettings(event) {
    event.preventDefault()
    if (!user) return
    setSavingSettings(true)
    setError("")
    try {
      await setDoc(doc(db, "resortOwners", user.uid, "site", PAYMENT_DOC), {
        gcashQrUrl: paymentSettings.gcashQrUrl,
        instructions: paymentSettings.instructions.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setNotice("GCash payment details saved and synced to your booking page.")
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingSettings(false)
    }
  }

  async function uploadQr(file) {
    if (!file || !user) return
    setError("")
    if (!file.type.startsWith("image/")) {
      setError("Choose a QR image file.")
      return
    }
    if (file.size > MAX_QR_BYTES) {
      setError("The QR image must be 320 KB or smaller so it fits in the existing Firebase payment record.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPaymentSettings((current) => ({ ...current, gcashQrUrl: String(reader.result || "") }))
    reader.onerror = () => setError("Could not read that image. Please try another file.")
    reader.readAsDataURL(file)
  }

  async function confirmPayment(booking) {
    if (!user || booking.ownerUid !== user.uid) return
    setBusyBookingId(booking.id)
    setError("")
    try {
      const total = getTotal(booking)
      await updateDoc(doc(db, "guestbooking", booking.id), {
        status: "Approved",
        paymentStatus: "paid",
        paidAmount: total,
        totalPrice: total || booking.totalPrice || 0,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setSelectedProof(null)
      setNotice(`Payment for ${booking.name || "guest"} marked as received.`)
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setBusyBookingId("")
    }
  }

  async function login() {
    setError("")
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" })
      await signInWithPopup(auth, googleProvider)
    } catch (loginError) {
      setError(loginError.message)
    }
  }

  if (!authReady) return <main className="loading-screen">Connecting to payment workspace…</main>

  if (!user) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <div className="brand-mark"><WalletCards size={23} /></div>
          <p className="eyebrow">RESORT OPERATIONS</p>
          <h1>GCash payments</h1>
          <p className="login-copy">Manage your payment QR and verify guest payments in one focused workspace.</p>
          {error && <p className="notice error">{error}</p>}
          <button className="primary-button full-button" onClick={login}>Continue with Google</button>
          <p className="login-foot"><ShieldCheck size={15} /> Sign in with the Google account linked to your resort.</p>
        </section>
        <div className="login-aside"><span>01 / PAYMENTS</span><p>Clear payment records.<br />Confident check-ins.</p></div>
      </main>
    )
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark small"><WalletCards size={18} /></span><span>Stay / Accounts</span></div>
        <p className="side-label">WORKSPACE</p>
        <button className={`side-link ${view === "payments" ? "active" : ""}`} onClick={() => setView("payments")}><CircleDollarSign size={17} /> Payments</button>
        <button className={`side-link ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}><Settings2 size={17} /> GCash setup</button>
        <div className="sidebar-bottom">
          <span className={`connection-dot ${ownerApproved ? "approved" : ""}`} />
          <div><strong>{ownerName}</strong><small>{ownerApproved ? "Approved resort" : "Owner account"}</small></div>
          <button className="icon-button logout-button" title="Sign out" onClick={() => signOut(auth)}><LogOut size={17} /></button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div><span className="crumb">Payments</span><span className="crumb-separator">/</span><strong>{view === "payments" ? "Payment activity" : "GCash settings"}</strong></div>
          <div className="user-chip"><span className="avatar">{(user.displayName || user.email || "R").slice(0, 1).toUpperCase()}</span><span>{user.displayName || user.email}</span></div>
        </header>

        <div className="content">
          {notice && <div className="notice success"><Check size={16} />{notice}<button className="notice-close" onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
          {error && <div className="notice error"><X size={16} />{error}<button className="notice-close" onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}

          {view === "payments" ? (
            <>
              <div className="page-heading"><div><p className="eyebrow">PAYMENT MANAGEMENT</p><h1>Payment activity</h1><p>Review submitted proof and keep paid booking records up to date.</p></div><button className="secondary-button" onClick={() => setView("settings")}><QrCode size={17} /> Manage GCash QR</button></div>
              <div className="metrics-row">
                <section className="metric"><span className="metric-icon green"><CircleDollarSign size={19} /></span><div><span>Verified payments</span><strong>{paidBookings.length}</strong></div><small>{money(paidTotal)} recorded</small></section>
                <section className="metric"><span className="metric-icon amber"><Clock3 size={19} /></span><div><span>Awaiting review</span><strong>{pendingBookings.length}</strong></div><small>Unpaid bookings</small></section>
                <section className="metric"><span className="metric-icon blue"><BadgeCheck size={19} /></span><div><span>GCash status</span><strong className="status-text">{paymentSettings.gcashQrUrl ? "Active" : "Setup needed"}</strong></div><small>{paymentSettings.gcashQrUrl ? "QR available to guests" : "Add a QR code to begin"}</small></section>
              </div>

              <div className="table-toolbar">
                <div className="filter-tabs" role="group" aria-label="Filter payments">
                  {[ ["all", "All", bookings.length], ["pending", "Needs review", pendingBookings.length], ["paid", "Paid", paidBookings.length] ].map(([key, label, count]) => <button key={key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{label}<span>{count}</span></button>)}
                </div>
                <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guest or room" /></label>
              </div>

              <div className="payment-table-wrap">
                <table className="payment-table">
                  <thead><tr><th>GUEST</th><th>STAY</th><th>AMOUNT</th><th>PROOF</th><th>STATUS</th><th /></tr></thead>
                  <tbody>
                    {filteredBookings.map((booking) => <tr key={booking.id}>
                      <td><strong>{booking.name || "Guest"}</strong><small>{booking.email || booking.id}</small></td>
                      <td><strong>{booking.roomType || "Room"}</strong><small>{readableDate(booking.checkIn)} – {readableDate(booking.checkOut)}</small></td>
                      <td><strong>{money(getTotal(booking))}</strong><small>Booking total</small></td>
                      <td>{booking.proofOfPaymentUrl ? <button className="proof-link" onClick={() => setSelectedProof(booking)}><ExternalLink size={14} /> View proof</button> : <span className="no-proof">Not submitted</span>}</td>
                      <td><span className={`payment-badge ${booking.paymentStatus === "paid" ? "paid" : "pending"}`}><i />{booking.paymentStatus === "paid" ? "Paid" : "Unpaid"}</span></td>
                      <td>{booking.paymentStatus !== "paid" && booking.proofOfPaymentUrl ? <button className="verify-button" disabled={busyBookingId === booking.id} onClick={() => confirmPayment(booking)}>{busyBookingId === booking.id ? "Saving…" : "Verify payment"}</button> : <span className="dash">—</span>}</td>
                    </tr>)}
                    {filteredBookings.length === 0 && <tr><td className="empty-row" colSpan={6}><div className="empty-icon"><WalletCards size={22} /></div><strong>No payment records here</strong><span>Bookings for this resort will appear as guests submit payment details.</span></td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="data-note"><ShieldCheck size={14} /> Records are scoped to your signed-in resort account.</p>
            </>
          ) : (
            <>
              <div className="page-heading"><div><p className="eyebrow">PAYMENT METHOD</p><h1>GCash setup</h1><p>These details appear in the existing guest booking payment step.</p></div><span className={`setup-pill ${paymentSettings.gcashQrUrl ? "ready" : ""}`}><span />{paymentSettings.gcashQrUrl ? "Live for guests" : "Not configured"}</span></div>
              {!ownerApproved && <div className="notice warning"><ShieldCheck size={16} />Your resort account is not approved yet. You can prepare settings, but guests will only see a payment method when your resort is published.</div>}
              <form className="settings-layout" onSubmit={savePaymentSettings}>
                <section className="settings-main">
                  <div className="section-heading"><div><h2>GCash QR code</h2><p>Use a clear image of your GCash receiving QR.</p></div><QrCode size={19} /></div>
                  <button type="button" className={`qr-drop ${paymentSettings.gcashQrUrl ? "has-qr" : ""}`} onClick={() => fileInput.current?.click()}>
                    {paymentSettings.gcashQrUrl ? <><img src={paymentSettings.gcashQrUrl} alt="Current GCash QR" /><span className="change-image"><Upload size={15} /> Replace QR image</span></> : <><span className="upload-symbol"><Upload size={20} /></span><strong>Upload GCash QR</strong><span>PNG or JPG, up to 320 KB</span></>}
                  </button>
                  <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { uploadQr(event.target.files?.[0]); event.target.value = "" }} />
                  <div className="field-block"><label htmlFor="instructions">Instructions for guests</label><textarea id="instructions" rows={4} value={paymentSettings.instructions} onChange={(event) => setPaymentSettings((current) => ({ ...current, instructions: event.target.value }))} placeholder="Example: Pay the reservation amount using the QR code, then upload your payment receipt." /><small>Shown with the QR on your resort’s booking form.</small></div>
                  <div className="form-actions"><span>Changes sync to your resort payment settings.</span><button className="primary-button" disabled={savingSettings || !paymentSettings.gcashQrUrl}>{savingSettings ? "Saving…" : "Save payment method"}</button></div>
                </section>
                <aside className="settings-aside"><span className="aside-icon"><ShieldCheck size={20} /></span><h3>Manual verification</h3><p>Guests submit a payment receipt with their booking. Review the image before confirming payment.</p><div className="aside-divider" /><span className="aside-icon"><QrCode size={20} /></span><h3>Shared with booking</h3><p>This copy uses the same Firebase payment record as the full resort booking app.</p></aside>
              </form>
            </>
          )}
        </div>
      </section>

      {selectedProof && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedProof(null)}><section className="proof-modal" role="dialog" aria-modal="true" aria-label="Payment proof" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">PAYMENT REVIEW</p><h2>{selectedProof.name || "Guest"}</h2></div><button className="icon-button" onClick={() => setSelectedProof(null)} aria-label="Close"><X size={19} /></button></header><div className="proof-image-frame"><img src={selectedProof.proofOfPaymentUrl} alt={`Payment proof from ${selectedProof.name || "guest"}`} /></div><div className="proof-details"><span>{selectedProof.roomType || "Room"} · {readableDate(selectedProof.checkIn)} – {readableDate(selectedProof.checkOut)}</span><strong>{money(getTotal(selectedProof))}</strong></div><footer><button className="secondary-button" onClick={() => setSelectedProof(null)}>Close</button><button className="primary-button" disabled={selectedProof.paymentStatus === "paid" || busyBookingId === selectedProof.id} onClick={() => confirmPayment(selectedProof)}>{selectedProof.paymentStatus === "paid" ? "Already verified" : <><Check size={16} /> Verify and mark paid</>}</button></footer></section></div>}
    </main>
  )
}