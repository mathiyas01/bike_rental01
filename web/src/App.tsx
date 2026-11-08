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
type SelectOption = { value: string; label: string };
type FormField = { key: string; label: string; type?: string; required?: boolean; options?: string[]; selectOptions?: SelectOption[] };
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
function Button({ children, onClick, secondary = false, danger = false, type = 'button' }: { children: React.ReactNode; onClick?: () => void; secondary?: boolean; danger?: boolean; type?: 'button' | 'submit' }) { return <button type={type} className={danger ? 'danger' : secondary ? 'secondary' : 'primary'} onClick={onClick}>{children}</button>; }
function Table({ columns, rows, onRow }: { columns: string[]; rows: RecordData[]; onRow?: (r: RecordData) => void }) { return <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.id || i} onClick={() => onRow?.(r)}>{columns.map(c => <td key={c}>{String(r[c] ?? '—')}</td>)}</tr>)}</tbody></table></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon" onClick={onClose}><X /></button></div>{children}</div></div>; }
function Fields({ fields, values, setValues }: { fields: FormField[]; values: RecordData; setValues: (v: RecordData) => void }) { return <div className="form-grid">{fields.map(f => <label key={f.key}>{f.label}{f.selectOptions || f.options ? <select required={f.required} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })}><option value="">Select…</option>{f.selectOptions ? f.selectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : f.options?.map(o => <option key={o}>{o}</option>)}</select> : <input required={f.required} type={f.type || 'text'} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />}</label>)}</div>; }

function Dashboard() {
  const [kpi, setKpi] = useState<RecordData | null>(null); const [util, setUtil] = useState<RecordData | null>(null); const [error, setError] = useState('');
  useEffect(() => { Promise.all([api.get('/api/v1/reports/dashboard'), api.get('/api/v1/reports/fleet-utilization')]).then(([a, b]) => { setKpi(a.data); setUtil(b.data); }).catch(e => setError(errorMessage(e))); }, []);
  const cards = kpi ? [['Active rentals', kpi.activeRentalsCount, ClipboardList], ['Available fleet', kpi.availableBikesCount, Bike], ['In service', kpi.inServiceBikesCount, Wrench], ['Overdue charges', kpi.overdueChargesCount, AlertTriangle]] as const : [];
  return <Page title="Dashboard" subtitle="Live overview from your rental operations."><State loading={!kpi && !error} error={error} empty={false}><div className="kpi-grid">{cards.map(([label, value, Icon]) => <div className="kpi" key={label}><div className="kpi-icon"><Icon size={19} /></div><span>{label}</span><strong>{value}</strong></div>)}</div><div className="panel-grid"><div className="panel"><div className="panel-title"><div><h2>Revenue by currency</h2><p className="muted">Current reporting period</p></div><CircleDollarSign /></div><div className="money-list">{currencies.map(c => <div key={c}><b>{c}</b><strong>{Number(kpi?.monthlyRevenue?.[c] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>)}</div></div><div className="panel"><div className="panel-title"><div><h2>Fleet utilization</h2><p className="muted">Backend-calculated utilization</p></div><BarChart3 /></div><div className="util-value">{Number(util?.utilizationRate || 0).toFixed(1)}<small>%</small></div><div className="progress"><span style={{ width: `${Math.min(100, Number(util?.utilizationRate || 0))}%` }} /></div></div></div><div className="alert-strip"><CheckCircle2 size={18} /><span><b>{kpi?.lowStockPartsCount || 0}</b> parts below reorder level</span><Link to="/inventory">Review inventory <ChevronRight size={15} /></Link></div></State></Page>;
}

function CrudPage({ title, subtitle, path, columns, fields, createLabel, secondaryAction, onRow }: { title: string; subtitle: string; path: string; columns: string[]; fields: FormField[]; createLabel: string; secondaryAction?: React.ReactNode; onRow?: (row: RecordData) => void }) {
  const resource = useResource<RecordData>(path, { page: 0, size: 100 }); const [modal, setModal] = useState(false); const [values, setValues] = useState<RecordData>({}); const [formError, setFormError] = useState('');
  const submit = async (e: FormEvent) => { e.preventDefault(); setFormError(''); try { await api.post(path, normalize(values, fields)); setModal(false); setValues({}); await resource.refresh(); } catch (err) { setFormError(errorMessage(err)); } };
  return <Page title={title} subtitle={subtitle} action={<div className="page-actions">{secondaryAction}<Button onClick={() => setModal(true)}><Plus size={17} />{createLabel}</Button></div>}><State loading={resource.loading} error={resource.error} empty={!resource.data.length}><Table columns={columns} rows={resource.data} onRow={onRow} /></State>{modal && <Modal title={createLabel} onClose={() => setModal(false)}><form onSubmit={submit}><Fields fields={fields} values={values} setValues={setValues} />{formError && <div className="error">{formError}</div>}<div className="modal-actions"><Button secondary onClick={() => setModal(false)}>Cancel</Button><Button type="submit">Save</Button></div></form></Modal>}</Page>;
}
function normalize(values: RecordData, fields: FormField[]) { const out = { ...values }; fields.filter(f => ['number', 'date'].includes(f.type || '')).forEach(f => { if (out[f.key] !== '') out[f.key] = f.type === 'number' ? Number(out[f.key]) : out[f.key]; }); return out; }
function Bikes() { return <CrudPage title="Fleet" subtitle="Manage registered motorbikes, documents and availability." path="/api/v1/bikes" columns={['registrationNumber', 'make', 'model', 'status', 'currentOdometer']} fields={[{ key: 'registrationNumber', label: 'Registration number', required: true }, { key: 'vin', label: 'VIN / chassis number', required: true }, { key: 'make', label: 'Make', required: true }, { key: 'model', label: 'Model', required: true }, { key: 'manufactureYear', label: 'Manufacture year', type: 'number', required: true }, { key: 'currentOdometer', label: 'Odometer', type: 'number', required: true }, { key: 'serviceIntervalDays', label: 'Service interval (days)', type: 'number', required: true }]} createLabel="Register motorbike" />; }
function Customers() { return <CrudPage title="Customers" subtitle="Customer records, licence details and financial history." path="/api/v1/customers" columns={['fullName', 'phone', 'email', 'status']} fields={[{ key: 'fullName', label: 'Full name', required: true }, { key: 'phone', label: 'Phone', required: true }, { key: 'email', label: 'Email', type: 'email' }, { key: 'cnpOrTaxId', label: 'CNP / Tax ID' }, { key: 'drivingLicenceNumber', label: 'Driving licence number' }, { key: 'licenceCategories', label: 'Licence categories' }, { key: 'licenceExpiryDate', label: 'Licence expiry', type: 'date' }, { key: 'livingCity', label: 'Living City' }, { key: 'address', label: 'Address' }]} createLabel="Register customer" />; }
function Rentals() {
  const resource = useResource<RecordData>('/api/v1/rentals', { page: 0, size: 100 });
  const customers = useResource<RecordData>('/api/v1/customers', { page: 0, size: 100 });
  const bikes = useResource<RecordData>('/api/v1/bikes', { page: 0, size: 100 });
  const [modal, setModal] = useState(false);
  const [selectedRental, setSelectedRental] = useState<RecordData | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'payment' | 'close'>('view');
  const [values, setValues] = useState<RecordData>({});
  const [formError, setFormError] = useState('');
  const customerOptions = customers.data.filter(customer => !customer.archived).map(customer => ({
    value: customer.id,
    label: `${customer.fullName} (${customer.phone})`,
  }));
  const bikeOptions = bikes.data.filter(bike => !bike.archived).map(bike => ({
    value: bike.id,
    label: `${bike.registrationNumber} — ${bike.make} ${bike.model}`,
  }));
  const fields: FormField[] = [
    { key: 'customerId', label: 'Customer', required: true, selectOptions: customerOptions },
    { key: 'motorbikeId', label: 'Bike', required: true, selectOptions: bikeOptions },
    { key: 'startDate', label: 'Start date', type: 'date', required: true },
    { key: 'plannedEndDate', label: 'Planned end date', type: 'date' },
    { key: 'weeklyRate', label: 'Weekly rate', type: 'number', required: true },
    { key: 'currency', label: 'Currency', options: currencies, required: true },
    { key: 'depositAmount', label: 'Deposit', type: 'number' },
    { key: 'depositCurrency', label: 'Deposit currency', options: currencies },
  ];
  const editFields: FormField[] = [
    { key: 'motorbikeId', label: 'Bike', required: true, selectOptions: bikeOptions },
    { key: 'startDate', label: 'Start date', type: 'date', required: true },
    { key: 'plannedEndDate', label: 'Planned end date', type: 'date' },
    { key: 'weeklyRate', label: 'Weekly rate', type: 'number', required: true },
    { key: 'currency', label: 'Currency', options: currencies, required: true },
    { key: 'depositAmount', label: 'Deposit', type: 'number' },
    { key: 'depositCurrency', label: 'Deposit currency', options: currencies },
    { key: 'termsAndNotes', label: 'Terms and notes' },
  ];
  const paymentFields: FormField[] = [
    { key: 'paymentDate', label: 'Payment date', type: 'date', required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'currency', label: 'Currency', options: currencies, required: true },
    { key: 'paymentMethod', label: 'Payment method', options: ['CASH', 'BANK_TRANSFER', 'CARD'], required: true },
    { key: 'referenceNumber', label: 'Reference number' },
    { key: 'notes', label: 'Notes' },
  ];
  const closeFields: FormField[] = [
    { key: 'closureDate', label: 'Closure date', type: 'date', required: true },
    { key: 'notes', label: 'Closure notes' },
  ];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await api.post('/api/v1/rentals', normalize(values, fields));
      setModal(false);
      setValues({});
      await resource.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };
  const openRental = (rental: RecordData) => {
    setSelectedRental(rental);
    setMode('view');
    setFormError('');
  };
  const closeDetails = () => {
    setSelectedRental(null);
    setMode('view');
    setFormError('');
  };
  const startEdit = () => {
    if (!selectedRental) return;
    setValues({
      motorbikeId: selectedRental.bikeId,
      startDate: selectedRental.startDate,
      plannedEndDate: selectedRental.plannedEndDate || '',
      weeklyRate: selectedRental.weeklyRate,
      currency: selectedRental.currency,
      depositAmount: selectedRental.depositAmount,
      depositCurrency: selectedRental.depositCurrency,
      termsAndNotes: selectedRental.termsAndNotes || '',
    });
    setFormError('');
    setMode('edit');
  };
  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRental) return;
    setFormError('');
    try {
      const { data } = await api.put(`/api/v1/rentals/${selectedRental.id}`, normalize(values, editFields));
      setSelectedRental(data);
      setValues({});
      setMode('view');
      await resource.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };
  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRental) return;
    setFormError('');
    try {
      await api.post('/api/v1/payments', {
        ...normalize(values, paymentFields),
        customerId: selectedRental.customerId,
        rentalId: selectedRental.id,
      });
      setValues({});
      setMode('view');
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };
  const submitClose = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRental) return;
    setFormError('');
    try {
      const { data } = await api.post(`/api/v1/rentals/${selectedRental.id}/close`, values);
      setSelectedRental(data);
      setValues({});
      setMode('view');
      await resource.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };
  const formLoading = customers.loading || bikes.loading;
  const formLoadError = customers.error || bikes.error;
  return <Page title="Rentals" subtitle="Active agreements and backend-generated weekly charges." action={<Button onClick={() => setModal(true)}><Plus size={17} />Create rental</Button>}>
    <State loading={resource.loading} error={resource.error} empty={!resource.data.length}><Table columns={['customerName', 'motorbikeRegistrationNumber', 'startDate', 'status', 'currency', 'weeklyRate']} rows={resource.data} onRow={openRental} /></State>
    {modal && <Modal title="Create rental" onClose={() => setModal(false)}>
      {formLoading ? <div className="state">Loading customers and bikes…</div> : formLoadError ? <div className="state error">{formLoadError}</div> : <form onSubmit={submit}><Fields fields={fields} values={values} setValues={setValues} />{formError && <div className="error">{formError}</div>}<div className="modal-actions"><Button secondary onClick={() => setModal(false)}>Cancel</Button><Button type="submit">Save</Button></div></form>}
    </Modal>}
    {selectedRental && <Modal title="Rental details" onClose={closeDetails}>
      {mode === 'view' && <><div className="detail-grid">
        <div><span>Customer</span><strong>{selectedRental.customerName}</strong><small>{selectedRental.customerPhone}</small></div>
        <div><span>Bike</span><strong>{selectedRental.bikeRegistrationNumber}</strong><small>{selectedRental.bikeMakeModel}</small></div>
        <div><span>Status</span><strong>{selectedRental.status}</strong></div>
        <div><span>Start date</span><strong>{selectedRental.startDate}</strong></div>
        <div><span>Planned end</span><strong>{selectedRental.plannedEndDate || '—'}</strong></div>
        <div><span>Weekly rate</span><strong>{selectedRental.weeklyRate} {selectedRental.currency}</strong></div>
        <div><span>Deposit</span><strong>{selectedRental.depositAmount} {selectedRental.depositCurrency}</strong></div>
        <div><span>Closed date</span><strong>{selectedRental.actualClosedDate || '—'}</strong></div>
      </div>
      {selectedRental.termsAndNotes && <p className="muted">{selectedRental.termsAndNotes}</p>}
      {formError && <div className="error">{formError}</div>}
      <div className="modal-actions"><Button secondary onClick={startEdit}>Edit rental</Button>{selectedRental.status === 'ACTIVE' && <><Button secondary onClick={() => { setValues({ paymentDate: new Date().toISOString().slice(0, 10), currency: selectedRental.currency }); setFormError(''); setMode('payment'); }}>Record payment</Button><Button danger onClick={() => { setValues({ closureDate: new Date().toISOString().slice(0, 10) }); setFormError(''); setMode('close'); }}>Terminate rental</Button></>}</div></>}
      {mode === 'edit' && <form onSubmit={submitEdit}><Fields fields={editFields} values={values} setValues={setValues} />{formError && <div className="error">{formError}</div>}<div className="modal-actions"><Button secondary onClick={() => setMode('view')}>Cancel</Button><Button type="submit">Save changes</Button></div></form>}
      {mode === 'payment' && <form onSubmit={submitPayment}><Fields fields={paymentFields} values={values} setValues={setValues} />{formError && <div className="error">{formError}</div>}<div className="modal-actions"><Button secondary onClick={() => setMode('view')}>Cancel</Button><Button type="submit">Record payment</Button></div></form>}
      {mode === 'close' && <form onSubmit={submitClose}><Fields fields={closeFields} values={values} setValues={setValues} />{formError && <div className="error">{formError}</div>}<div className="modal-actions"><Button secondary onClick={() => setMode('view')}>Cancel</Button><Button type="submit">Confirm termination</Button></div></form>}
    </Modal>}
  </Page>;
}
function Payments() {
  const resource = useResource<RecordData>('/api/v1/payments', { page: 0, size: 100 });
  const customers = useResource<RecordData>('/api/v1/customers', { page: 0, size: 100 });
  const rentals = useResource<RecordData>('/api/v1/rentals', { page: 0, size: 100 });
  const [modal, setModal] = useState(false);
  const [values, setValues] = useState<RecordData>({});
  const [formError, setFormError] = useState('');
  const customerOptions = customers.data.filter(customer => !customer.archived).map(customer => ({
    value: customer.id,
    label: `${customer.fullName} (${customer.phone})`,
  }));
  const customerRentals = rentals.data.filter(rental => rental.customerId === values.customerId);
  const rentalOptions = customerRentals.map(rental => ({
    value: rental.id,
    label: `${rental.bikeRegistrationNumber} — ${rental.startDate} (${rental.status})`,
  }));
  const fields: FormField[] = [
    { key: 'customerId', label: 'Customer', required: true, selectOptions: customerOptions },
    { key: 'rentalId', label: 'Rental', required: true, selectOptions: rentalOptions },
    { key: 'paymentDate', label: 'Payment date', type: 'date', required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'currency', label: 'Currency', options: currencies, required: true },
    { key: 'paymentMethod', label: 'Payment method', options: ['CASH', 'BANK_TRANSFER', 'CARD'], required: true },
    { key: 'referenceNumber', label: 'Reference number' },
    { key: 'notes', label: 'Notes' },
  ];
  useEffect(() => {
    if (!values.customerId) {
      if (values.rentalId) setValues(current => ({ ...current, rentalId: '' }));
      return;
    }
    if (customerRentals.length === 1 && values.rentalId !== customerRentals[0].id) {
      setValues(current => ({ ...current, rentalId: customerRentals[0].id }));
    } else if (customerRentals.length !== 1 && values.rentalId && !customerRentals.some(rental => rental.id === values.rentalId)) {
      setValues(current => ({ ...current, rentalId: '' }));
    }
  }, [values.customerId, customerRentals.length, values.rentalId]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await api.post('/api/v1/payments', normalize(values, fields));
      setModal(false);
      setValues({});
      await resource.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };
  const formLoading = customers.loading || rentals.loading;
  const formLoadError = customers.error || rentals.error;
  return <Page title="Payments" subtitle="Record collections and preserve FIFO/manual allocation rules in the backend." action={<Button onClick={() => setModal(true)}><Plus size={17} />Record payment</Button>}>
    <State loading={resource.loading} error={resource.error} empty={!resource.data.length}><Table columns={['customerName', 'paymentDate', 'amount', 'currency', 'paymentMethod', 'status']} rows={resource.data} /></State>
    {modal && <Modal title="Record payment" onClose={() => setModal(false)}>
      {formLoading ? <div className="state">Loading customers and rentals…</div> : formLoadError ? <div className="state error">{formLoadError}</div> : <form onSubmit={submit}><Fields fields={fields} values={values} setValues={setValues} />{values.customerId && rentalOptions.length === 0 && <div className="error">This customer has no rentals available for payment.</div>}{formError && <div className="error">{formError}</div>}<div className="modal-actions"><Button secondary onClick={() => setModal(false)}>Cancel</Button><Button type="submit">Save</Button></div></form>}
    </Modal>}
  </Page>;
}
function Servicing() {
  const resource = useResource<RecordData>('/api/v1/services', { page: 0, size: 100 });
  const bikes = useResource<RecordData>('/api/v1/bikes', { page: 0, size: 100 });
  const parts = useResource<RecordData>('/api/v1/parts', { page: 0, size: 100 });
  const [modal, setModal] = useState(false);
  const [values, setValues] = useState<RecordData>({});
  const [partRows, setPartRows] = useState<{ partId: string; quantity: string }[]>([]);
  const [formError, setFormError] = useState('');
  const fields: FormField[] = [
    { key: 'motorbikeId', label: 'Bike', required: true, selectOptions: bikes.data.filter(bike => !bike.archived).map(bike => ({ value: bike.id, label: `${bike.registrationNumber} — ${bike.make} ${bike.model}` })) },
    { key: 'serviceDate', label: 'Service date', type: 'date', required: true },
    { key: 'odometerReading', label: 'Odometer reading', type: 'number', required: true },
    { key: 'serviceProvider', label: 'Service provider', required: true },
    { key: 'workPerformed', label: 'Work performed', required: true },
    { key: 'labourCost', label: 'Labour cost', type: 'number', required: true },
    { key: 'labourCurrency', label: 'Currency', options: currencies, required: true },
  ];
  const addPartRow = () => setPartRows(rows => [...rows, { partId: '', quantity: '' }]);
  const updatePartRow = (index: number, key: 'partId' | 'quantity', value: string) => {
    setPartRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };
  const removePartRow = (index: number) => setPartRows(rows => rows.filter((_, rowIndex) => rowIndex !== index));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (partRows.some(row => !row.partId || !row.quantity || Number(row.quantity) <= 0)) {
      setFormError('Select a stock item and enter a quantity greater than zero for every row.');
      return;
    }
    const partsUsed = partRows.map(row => {
      const part = parts.data.find(item => item.id === row.partId);
      return {
        partId: row.partId,
        quantity: Number(row.quantity),
        unitCost: part?.defaultUnitCost,
        currency: part?.costCurrency,
      };
    });
    try {
      await api.post('/api/v1/services', { ...normalize(values, fields), partsUsed });
      setModal(false);
      setValues({});
      setPartRows([]);
      await resource.refresh();
      await parts.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };
  const formLoading = bikes.loading || parts.loading;
  const formLoadError = bikes.error || parts.error;
  return <Page title="Servicing" subtitle="Log maintenance and deduct used stock automatically." action={<Button onClick={() => setModal(true)}><Plus size={17} />Log service</Button>}>
    <State loading={resource.loading} error={resource.error} empty={!resource.data.length}><Table columns={['motorbikeRegistrationNumber', 'serviceDate', 'serviceProvider', 'workPerformed', 'labourCost', 'status']} rows={resource.data} /></State>
    {modal && <Modal title="Log service" onClose={() => setModal(false)}>
      {formLoading ? <div className="state">Loading bikes and inventory…</div> : formLoadError ? <div className="state error">{formLoadError}</div> : <form onSubmit={submit}>
        <Fields fields={fields} values={values} setValues={setValues} />
        <div className="parts-section">
          <div className="parts-section-header"><strong>Parts used</strong><Button secondary onClick={addPartRow}><Plus size={15} />Add item</Button></div>
          {partRows.length === 0 && <p className="muted">No inventory items selected.</p>}
          {partRows.map((row, index) => <div className="part-row" key={index}>
            <select required value={row.partId} onChange={e => updatePartRow(index, 'partId', e.target.value)}>
              <option value="">Select stock item…</option>
              {parts.data.filter(part => part.active).map(part => <option key={part.id} value={part.id}>{part.partCode} — {part.name} (stock: {part.currentQuantity})</option>)}
            </select>
            <input required type="number" min="0.01" step="0.01" placeholder="Quantity" value={row.quantity} onChange={e => updatePartRow(index, 'quantity', e.target.value)} />
            <button type="button" className="icon" aria-label="Remove item" onClick={() => removePartRow(index)}><X size={17} /></button>
          </div>)}
        </div>
        {formError && <div className="error">{formError}</div>}
        <div className="modal-actions"><Button secondary onClick={() => setModal(false)}>Cancel</Button><Button type="submit">Save</Button></div>
      </form>}
    </Modal>}
  </Page>;
}
function AddStockAction({ selectedPart, onClear }: { selectedPart: RecordData | null; onClear: () => void }) {
  const parts = useResource<RecordData>('/api/v1/parts', { page: 0, size: 100 });
  const [modal, setModal] = useState(false);
  const [values, setValues] = useState<RecordData>({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (selectedPart) {
      setValues({ partId: selectedPart.id, currency: selectedPart.costCurrency });
      setError('');
      setModal(true);
    }
  }, [selectedPart?.id]);
  const fields: FormField[] = [
    { key: 'partId', label: 'Inventory item', required: true, selectOptions: parts.data.filter(part => part.active).map(part => ({ value: part.id, label: `${part.partCode} — ${part.name} (stock: ${part.currentQuantity})` })) },
    { key: 'quantity', label: 'Quantity to add', type: 'number', required: true },
    { key: 'unitCost', label: 'Unit cost', type: 'number' },
    { key: 'currency', label: 'Currency', options: currencies, required: true },
    { key: 'reason', label: 'Reason' },
  ];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/v1/stock-movements', {
        ...normalize(values, fields),
        movementType: 'STOCK_IN',
        referenceType: 'MANUAL_STOCK_IN',
      });
      setModal(false);
      setValues({});
      await parts.refresh();
      onClear();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const closeModal = () => {
    setModal(false);
    setValues({});
    onClear();
  };
  return <><Button secondary onClick={() => setModal(true)}><Plus size={17} />Add stock</Button>{modal && <Modal title="Add stock" onClose={closeModal}>
    {parts.loading ? <div className="state">Loading inventory…</div> : parts.error ? <div className="state error">{parts.error}</div> : <form onSubmit={submit}><Fields fields={fields} values={values} setValues={setValues} />{error && <div className="error">{error}</div>}<div className="modal-actions"><Button secondary onClick={closeModal}>Cancel</Button><Button type="submit">Add quantity</Button></div></form>}
  </Modal>}</>;
}
function Inventory() {
  const [selectedPart, setSelectedPart] = useState<RecordData | null>(null);
  const fields: FormField[] = [
    { key: 'partCode', label: 'Part code', required: true },
    { key: 'name', label: 'Part name', required: true },
    { key: 'category', label: 'Category', required: true },
    { key: 'unitOfMeasure', label: 'Unit', required: true },
    { key: 'initialQuantity', label: 'Initial quantity', type: 'number', required: true },
    { key: 'minReorderLevel', label: 'Minimum reorder level', type: 'number', required: true },
    { key: 'defaultUnitCost', label: 'Default unit cost', type: 'number', required: true },
    { key: 'costCurrency', label: 'Currency', options: currencies, required: true },
  ];
  return <CrudPage title="Inventory" subtitle="Spare parts, reorder levels and stock movement ledger." path="/api/v1/parts" columns={['partCode', 'name', 'category', 'currentQuantity', 'minReorderLevel', 'costCurrency']} fields={fields} createLabel="Add spare part" onRow={setSelectedPart} secondaryAction={<AddStockAction selectedPart={selectedPart} onClear={() => setSelectedPart(null)} />} />;
}
function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [report, setReport] = useState<RecordData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const money = (values: RecordData | undefined) => Object.entries(values || {}).map(([currency, value]) => `${currency}: ${Number(value).toFixed(2)}`).join(' · ') || '—';
  const loadReport = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (fromDate > toDate) {
      setError('From date cannot be later than to date.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/api/v1/reports/date-range', { params: { fromDate, toDate } });
      setReport(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  const downloadPdf = () => {
    if (!report) return;
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
      setError('Allow pop-ups to generate the PDF report.');
      return;
    }
    popup.document.write(`<html><head><title>Rental report ${fromDate} to ${toDate}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#1f2937}h1{margin-bottom:4px}p{color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid #dbe1e8;border-radius:8px;padding:16px}.card h2{font-size:15px;margin:0 0 10px}.value{font-size:20px;font-weight:bold;margin:6px 0}.line{margin:5px 0}</style></head><body><h1>MotoRental Pro Report</h1><p>${fromDate} to ${toDate}</p><div class="grid"><div class="card"><h2>Rentals</h2><div class="value">${report.totalRentals}</div><div class="line">Active: ${report.activeRentals}</div><div class="line">Closed: ${report.closedRentals}</div></div><div class="card"><h2>Services</h2><div class="value">${report.serviceCount}</div><div class="line">Labour cost: ${money(report.labourCost)}</div><div class="line">Spare parts cost: ${money(report.sparePartsCost)}</div></div><div class="card"><h2>Revenue</h2><div class="line">${money(report.revenue)}</div></div><div class="card"><h2>Inventory movements</h2><div class="line">Stock in: ${report.stockInQuantity?.TOTAL || 0}</div><div class="line">Stock in cost: ${money(report.stockInCost)}</div><div class="line">Stock out: ${report.stockOutQuantity?.TOTAL || 0}</div><div class="line">Stock out cost: ${money(report.stockOutCost)}</div></div></div><script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
  };
  return <Page title="Reports" subtitle="Summarize rentals, revenue, servicing, and inventory for a selected period.">
    <form className="report-filters" onSubmit={loadReport}><label>From date<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} required /></label><label>To date<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} required /></label><Button type="submit">{loading ? 'Loading…' : 'Generate report'}</Button>{report && <Button secondary onClick={downloadPdf}>Download PDF</Button>}</form>
    {error && <div className="error">{error}</div>}
    {!report && !loading && !error && <div className="state">Select a date range and generate a report.</div>}
    {report && <div className="report-grid"><div className="panel"><h2>Rentals</h2><div className="report-value">{report.totalRentals}</div><p className="muted">Active: {report.activeRentals} · Closed: {report.closedRentals}</p></div><div className="panel"><h2>Revenue</h2><p>{money(report.revenue)}</p></div><div className="panel"><h2>Services</h2><div className="report-value">{report.serviceCount}</div><p>Labour: {money(report.labourCost)}</p><p>Spare parts: {money(report.sparePartsCost)}</p></div><div className="panel"><h2>Inventory</h2><p>Stock in: {report.stockInQuantity?.TOTAL || 0} (cost: {money(report.stockInCost)})</p><p>Stock out: {report.stockOutQuantity?.TOTAL || 0} (cost: {money(report.stockOutCost)})</p></div></div>}
  </Page>;
}
function SettingsPage({ language, setLanguage }: { language: string; setLanguage: (v: string) => void }) { const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'RON'); const [error, setError] = useState(''); const save = async (kind: 'language' | 'currency', value: string) => { setError(''); try { await api.patch(`/api/v1/auth/profile/${kind}`, kind === 'language' ? { preferredLanguage: value } : { preferredCurrency: value }); localStorage.setItem(kind === 'language' ? 'language' : 'currency', value); if (kind === 'language') setLanguage(value); else setCurrency(value); } catch (err) { setError(errorMessage(err)); } }; return <Page title="Settings" subtitle="Keep web preferences aligned with the authenticated profile.">{error && <div className="error">{error}</div>}<div className="settings-card"><Languages /><div><h2>Language</h2><p className="muted">English and Romanian are supported.</p></div><select value={language} onChange={e => void save('language', e.target.value)}><option value="en">English</option><option value="ro">Română</option></select></div><div className="settings-card"><CircleDollarSign /><div><h2>Currency display</h2><p className="muted">Balances remain isolated by currency.</p></div><select value={currency} onChange={e => void save('currency', e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></div></Page>; }
function More({ user, logout }: { user: User; logout: () => void }) { return <Page title="Account" subtitle="Profile and application actions."><div className="profile-card"><div className="avatar">{user.fullName?.[0] || 'O'}</div><div><h2>{user.fullName}</h2><p className="muted">{user.email} · {user.role}</p></div></div><Button onClick={logout}><LogOut size={17} />Sign out</Button></Page>; }

export default App;
