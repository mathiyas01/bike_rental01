import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive, BarChart3, Bike, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList,
  Gauge, Home, Languages, LogOut, Menu, Plus, Receipt, Settings, ShieldCheck,
  Wrench, Users, X, Package, AlertTriangle,
} from 'lucide-react';
import { api, errorMessage, list } from './api';

type User = { id: string; email: string; fullName: string; role: string; preferredLanguage?: string; preferredCurrency?: string };
type RecordData = Record<string, any>;
const nav = [
  ['/dashboard', 'Dashboard', Home], ['/bikes', 'Fleet', Bike], ['/customers', 'Customers', Users],
  ['/rentals', 'Rentals', ClipboardList], ['/payments', 'Payments', Receipt],
  ['/servicing', 'Servicing', Wrench], ['/inventory', 'Inventory', Package],
  ['/reports', 'Reports', BarChart3], ['/settings', 'Settings', Settings],
] as const;
const currencies = ['RON', 'EUR', 'USD'];

function App() {
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const logout = () => { localStorage.removeItem('jwt_token'); localStorage.removeItem('user'); setUser(null); };
  return <Routes>
    <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login onLogin={setUser} />} />
    <Route path="*" element={user ? <Shell user={user} logout={logout} language={language} setLanguage={setLanguage} /> : <Navigate to="/login" />} />
  </Routes>;
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('admin@bikerental.ro'); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const submit = async (e: FormEvent) => { e.preventDefault(); setError(''); try {
    const { data } = await api.post('/api/v1/auth/login', { email, password });
    localStorage.setItem('jwt_token', data.accessToken); localStorage.setItem('user', JSON.stringify(data.user)); onLogin(data.user);
  } catch (err) { setError(errorMessage(err)); } };
  return <main className="login-page"><form className="login-card" onSubmit={submit}>
    <div className="brand-mark"><Gauge size={25} /></div><h1>MotoRental Pro</h1><p className="muted">Fleet operations, in one place.</p>
    <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
    <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
    {error && <div className="error">{error}</div>}<button className="primary full" type="submit">Sign in <ChevronRight size={17} /></button>
  </form></main>;
}

function Shell({ user, logout, language, setLanguage }: { user: User; logout: () => void; language: string; setLanguage: (v: string) => void }) {
  const [open, setOpen] = useState(false); const location = useLocation();
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-brand"><div className="brand-mark small"><Gauge size={19} /></div><strong>MotoRental</strong><button className="icon mobile-only" onClick={() => setOpen(false)}><X /></button></div>
      <nav>{nav.map(([path, label, Icon]) => <Link key={path} to={path} onClick={() => setOpen(false)} className={location.pathname.startsWith(path) ? 'active' : ''}><Icon size={18} />{label}</Link>)}</nav>
      <div className="sidebar-footer"><Link to="/more"><ShieldCheck size={18} />Account</Link><button onClick={logout}><LogOut size={18} />Sign out</button></div>
    </aside>
    <section className="main"><header><button className="icon mobile-only" onClick={() => setOpen(true)}><Menu /></button><div><span className="eyebrow">MOTORBIKE RENTAL MANAGEMENT</span><strong>{nav.find(n => location.pathname.startsWith(n[0]))?.[1] || 'Account'}</strong></div><div className="user-chip"><span>{user.fullName?.[0] || 'O'}</span><div><b>{user.fullName}</b><small>{user.email}</small></div></div></header>
      <Routes><Route path="/dashboard" element={<Dashboard />} /><Route path="/bikes" element={<Bikes />} /><Route path="/customers" element={<Customers />} /><Route path="/rentals" element={<Rentals />} /><Route path="/payments" element={<Payments />} /><Route path="/servicing" element={<Servicing />} /><Route path="/inventory" element={<Inventory />} /><Route path="/reports" element={<Reports />} /><Route path="/settings" element={<SettingsPage language={language} setLanguage={setLanguage} />} /><Route path="/more" element={<More user={user} logout={logout} />} /><Route path="*" element={<Navigate to="/dashboard" />} /></Routes>
    </section>
  </div>;
}

function useResource<T>(path: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const refresh = async () => { setLoading(true); try { setData(await list<T>(path, params)); setError(''); } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, [path, JSON.stringify(params)]);
  return { data, loading, error, refresh };
}
function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) { return <main className="content"><div className="page-heading"><div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>{action}</div>{children}</main>; }
function State({ loading, error, empty, children }: { loading: boolean; error: string; empty: boolean; children: React.ReactNode }) { if (loading) return <div className="state">Loading data…</div>; if (error) return <div className="state error"><AlertTriangle size={18} />{error}</div>; if (empty) return <div className="state">No records found.</div>; return <>{children}</>; }
function Button({ children, onClick, secondary = false, type = 'button' }: { children: React.ReactNode; onClick?: () => void; secondary?: boolean; type?: 'button' | 'submit' }) { return <button type={type} className={secondary ? 'secondary' : 'primary'} onClick={onClick}>{children}</button>; }
function Table({ columns, rows, onRow }: { columns: string[]; rows: RecordData[]; onRow?: (r: RecordData) => void }) { return <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.id || i} onClick={() => onRow?.(r)}>{columns.map(c => <td key={c}>{String(r[c] ?? '—')}</td>)}</tr>)}</tbody></table></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon" onClick={onClose}><X /></button></div>{children}</div></div>; }
function Fields({ fields, values, setValues }: { fields: { key: string; label: string; type?: string; required?: boolean; options?: string[] }[]; values: RecordData; setValues: (v: RecordData) => void }) { return <div className="form-grid">{fields.map(f => <label key={f.key}>{f.label}{f.options ? <select required={f.required} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })}><option value="">Select…</option>{f.options.map(o => <option key={o}>{o}</option>)}</select> : <input required={f.required} type={f.type || 'text'} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />}</label>)}</div>; }

function Dashboard() {
  const [kpi, setKpi] = useState<RecordData | null>(null); const [util, setUtil] = useState<RecordData | null>(null); const [error, setError] = useState('');
  useEffect(() => { Promise.all([api.get('/api/v1/reports/dashboard'), api.get('/api/v1/reports/fleet-utilization')]).then(([a, b]) => { setKpi(a.data); setUtil(b.data); }).catch(e => setError(errorMessage(e))); }, []);
  const cards = kpi ? [['Active rentals', kpi.activeRentalsCount, ClipboardList], ['Available fleet', kpi.availableBikesCount, Bike], ['In service', kpi.inServiceBikesCount, Wrench], ['Overdue charges', kpi.overdueChargesCount, AlertTriangle]] as const : [];
  return <Page title="Dashboard" subtitle="Live overview from your rental operations."><State loading={!kpi && !error} error={error} empty={false}><div className="kpi-grid">{cards.map(([label, value, Icon]) => <div className="kpi" key={label}><div className="kpi-icon"><Icon size={19} /></div><span>{label}</span><strong>{value}</strong></div>)}</div><div className="panel-grid"><div className="panel"><div className="panel-title"><div><h2>Revenue by currency</h2><p className="muted">Current reporting period</p></div><CircleDollarSign /></div><div className="money-list">{currencies.map(c => <div key={c}><b>{c}</b><strong>{Number(kpi?.monthlyRevenue?.[c] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>)}</div></div><div className="panel"><div className="panel-title"><div><h2>Fleet utilization</h2><p className="muted">Backend-calculated utilization</p></div><BarChart3 /></div><div className="util-value">{Number(util?.utilizationRate || 0).toFixed(1)}<small>%</small></div><div className="progress"><span style={{ width: `${Math.min(100, Number(util?.utilizationRate || 0))}%` }} /></div></div></div><div className="alert-strip"><CheckCircle2 size={18} /><span><b>{kpi?.lowStockPartsCount || 0}</b> parts below reorder level</span><Link to="/inventory">Review inventory <ChevronRight size={15} /></Link></div></State></Page>;
}

function CrudPage({ title, subtitle, path, columns, fields, createLabel }: { title: string; subtitle: string; path: string; columns: string[]; fields: { key: string; label: string; type?: string; required?: boolean; options?: string[] }[]; createLabel: string }) {
  const resource = useResource<RecordData>(path, { page: 0, size: 100 }); const [modal, setModal] = useState(false); const [values, setValues] = useState<RecordData>({}); const [formError, setFormError] = useState('');
  const submit = async (e: FormEvent) => { e.preventDefault(); setFormError(''); try { await api.post(path, normalize(values, fields)); setModal(false); setValues({}); await resource.refresh(); } catch (err) { setFormError(errorMessage(err)); } };
  return <Page title={title} subtitle={subtitle} action={<Button onClick={() => setModal(true)}><Plus size={17} />{createLabel}</Button>}><State loading={resource.loading} error={resource.error} empty={!resource.data.length}><Table columns={columns} rows={resource.data} /></State>{modal && <Modal title={createLabel} onClose={() => setModal(false)}><form onSubmit={submit}><Fields fields={fields} values={values} setValues={setValues} />{formError && <div className="error">{formError}</div>}<div className="modal-actions"><Button secondary onClick={() => setModal(false)}>Cancel</Button><Button type="submit">Save</Button></div></form></Modal>}</Page>;
}
function normalize(values: RecordData, fields: { key: string; type?: string }[]) { const out = { ...values }; fields.filter(f => ['number', 'date'].includes(f.type || '')).forEach(f => { if (out[f.key] !== '') out[f.key] = f.type === 'number' ? Number(out[f.key]) : out[f.key]; }); return out; }
function Bikes() { return <CrudPage title="Fleet" subtitle="Manage registered motorbikes, documents and availability." path="/api/v1/bikes" columns={['registrationNumber', 'make', 'model', 'status', 'currentOdometer']} fields={[{ key: 'registrationNumber', label: 'Registration number', required: true }, { key: 'vin', label: 'VIN / chassis number', required: true }, { key: 'make', label: 'Make', required: true }, { key: 'model', label: 'Model', required: true }, { key: 'manufactureYear', label: 'Manufacture year', type: 'number', required: true }, { key: 'currentOdometer', label: 'Odometer', type: 'number', required: true }, { key: 'serviceIntervalDays', label: 'Service interval (days)', type: 'number', required: true }]} createLabel="Register motorbike" />; }
function Customers() { return <CrudPage title="Customers" subtitle="Customer records, licence details and financial history." path="/api/v1/customers" columns={['fullName', 'phone', 'email', 'status']} fields={[{ key: 'fullName', label: 'Full name', required: true }, { key: 'phone', label: 'Phone', required: true }, { key: 'email', label: 'Email', type: 'email' }, { key: 'cnpOrTaxId', label: 'CNP / Tax ID' }, { key: 'drivingLicenceNumber', label: 'Driving licence number' }, { key: 'licenceCategories', label: 'Licence categories' }, { key: 'licenceExpiryDate', label: 'Licence expiry', type: 'date' }, { key: 'address', label: 'Address' }]} createLabel="Register customer" />; }
function Rentals() { return <CrudPage title="Rentals" subtitle="Active agreements and backend-generated weekly charges." path="/api/v1/rentals" columns={['customerName', 'motorbikeRegistrationNumber', 'startDate', 'status', 'currency', 'weeklyRate']} fields={[{ key: 'customerId', label: 'Customer ID', required: true }, { key: 'motorbikeId', label: 'Motorbike ID', required: true }, { key: 'startDate', label: 'Start date', type: 'date', required: true }, { key: 'plannedEndDate', label: 'Planned end date', type: 'date' }, { key: 'weeklyRate', label: 'Weekly rate', type: 'number', required: true }, { key: 'currency', label: 'Currency', options: currencies, required: true }, { key: 'depositAmount', label: 'Deposit', type: 'number' }, { key: 'depositCurrency', label: 'Deposit currency', options: currencies }]} createLabel="Create rental" />; }
function Payments() { return <CrudPage title="Payments" subtitle="Record collections and preserve FIFO/manual allocation rules in the backend." path="/api/v1/payments" columns={['customerName', 'paymentDate', 'amount', 'currency', 'paymentMethod', 'status']} fields={[{ key: 'customerId', label: 'Customer ID', required: true }, { key: 'rentalId', label: 'Rental ID' }, { key: 'paymentDate', label: 'Payment date', type: 'date', required: true }, { key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'currency', label: 'Currency', options: currencies, required: true }, { key: 'paymentMethod', label: 'Payment method', options: ['CASH', 'BANK_TRANSFER', 'CARD'], required: true }, { key: 'referenceNumber', label: 'Reference number' }, { key: 'notes', label: 'Notes' }]} createLabel="Record payment" />; }
function Servicing() { return <CrudPage title="Servicing" subtitle="Log maintenance and let the backend atomically deduct parts." path="/api/v1/services" columns={['motorbikeRegistrationNumber', 'serviceDate', 'serviceProvider', 'workPerformed', 'labourCost', 'status']} fields={[{ key: 'motorbikeId', label: 'Motorbike ID', required: true }, { key: 'serviceDate', label: 'Service date', type: 'date', required: true }, { key: 'odometerReading', label: 'Odometer reading', type: 'number', required: true }, { key: 'serviceProvider', label: 'Service provider', required: true }, { key: 'workPerformed', label: 'Work performed', required: true }, { key: 'labourCost', label: 'Labour cost', type: 'number', required: true }, { key: 'labourCurrency', label: 'Currency', options: currencies, required: true }]} createLabel="Log service" />; }
function Inventory() { return <CrudPage title="Inventory" subtitle="Spare parts, reorder levels and stock movement ledger." path="/api/v1/parts" columns={['partCode', 'name', 'category', 'currentQuantity', 'minReorderLevel', 'costCurrency']} fields={[{ key: 'partCode', label: 'Part code', required: true }, { key: 'name', label: 'Part name', required: true }, { key: 'category', label: 'Category', required: true }, { key: 'unitOfMeasure', label: 'Unit', required: true }, { key: 'initialQuantity', label: 'Initial quantity', type: 'number', required: true }, { key: 'minReorderLevel', label: 'Minimum reorder level', type: 'number', required: true }, { key: 'defaultUnitCost', label: 'Default unit cost', type: 'number', required: true }, { key: 'costCurrency', label: 'Currency', options: currencies, required: true }]} createLabel="Add spare part" />; }
function Reports() { const bikes = useResource<RecordData>('/api/v1/bikes', { page: 0, size: 100 }); return <Page title="Reports" subtitle="Fleet utilization and per-motorbike ROI from the reporting API."><div className="panel"><div className="panel-title"><div><h2>Fleet utilization</h2><p className="muted">Select a bike to inspect backend-calculated profitability.</p></div><BarChart3 /></div><Table columns={['registrationNumber', 'make', 'model', 'status']} rows={bikes.data} /></div></Page>; }
function SettingsPage({ language, setLanguage }: { language: string; setLanguage: (v: string) => void }) { const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'RON'); const [error, setError] = useState(''); const save = async (kind: 'language' | 'currency', value: string) => { setError(''); try { await api.patch(`/api/v1/auth/profile/${kind}`, kind === 'language' ? { preferredLanguage: value } : { preferredCurrency: value }); localStorage.setItem(kind === 'language' ? 'language' : 'currency', value); if (kind === 'language') setLanguage(value); else setCurrency(value); } catch (err) { setError(errorMessage(err)); } }; return <Page title="Settings" subtitle="Keep web preferences aligned with the authenticated profile.">{error && <div className="error">{error}</div>}<div className="settings-card"><Languages /><div><h2>Language</h2><p className="muted">English and Romanian are supported.</p></div><select value={language} onChange={e => void save('language', e.target.value)}><option value="en">English</option><option value="ro">Română</option></select></div><div className="settings-card"><CircleDollarSign /><div><h2>Currency display</h2><p className="muted">Balances remain isolated by currency.</p></div><select value={currency} onChange={e => void save('currency', e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></div></Page>; }
function More({ user, logout }: { user: User; logout: () => void }) { return <Page title="Account" subtitle="Profile and application actions."><div className="profile-card"><div className="avatar">{user.fullName?.[0] || 'O'}</div><div><h2>{user.fullName}</h2><p className="muted">{user.email} · {user.role}</p></div></div><Button onClick={logout}><LogOut size={17} />Sign out</Button></Page>; }

export default App;
