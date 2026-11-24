import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive, BarChart3, Bike, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList,
  Gauge, Home, Languages, LogOut, Menu, Plus, Receipt, Settings, ShieldCheck,
  Wrench, Users, X, Package, AlertTriangle,
} from 'lucide-react';
import { api, errorMessage, listPage, resetUnauthorizedHandling, setUnauthorizedHandler, type PageResult } from './api';
import { LanguageContext, normalizeLanguage, useT, type Language } from './i18n';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

type User = { id: string; email: string; fullName: string; role: string; preferredLanguage?: string; preferredCurrency?: string };
type RecordData = Record<string, any>;
type SelectOption = { value: string; label: string };
type FormField = { key: string; label: string; type?: string; required?: boolean; options?: string[]; selectOptions?: SelectOption[] };
const nav = [
  ['/dashboard', 'dashboard', Home], ['/bikes', 'bikes', Bike], ['/customers', 'customers', Users],
  ['/rentals', 'rentals', ClipboardList], ['/payments', 'payments', Receipt],
  ['/servicing', 'servicing', Wrench], ['/inventory', 'inventory', Package],
  ['/reports', 'reports', BarChart3], ['/settings', 'settings', Settings],
] as const;
const currencies = ['RON', 'EUR', 'USD'];

function App() {
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [authReady, setAuthReady] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    if (saved) return normalizeLanguage(saved);
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null') as User | null;
    return normalizeLanguage(storedUser?.preferredLanguage);
  });
  const navigate = useNavigate();

  const logout = async () => {
    await signOut(firebaseAuth);
    localStorage.removeItem('user');
    setUser(null);
  };

  useEffect(() => onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
    if (!firebaseUser) {
      localStorage.removeItem('user');
      setUser(null);
      setAuthReady(true);
      return;
    }
    try {
      const { data } = await api.get<User>('/api/v1/auth/profile');
      localStorage.setItem('user', JSON.stringify(data));
      setUser(data);
    } catch {
      await signOut(firebaseAuth);
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setAuthReady(true);
    }
  }), []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      navigate('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  const handleLogin = (loggedInUser: User) => {
    resetUnauthorizedHandling();
    if (!localStorage.getItem('language') && (loggedInUser.preferredLanguage === 'ro' || loggedInUser.preferredLanguage === 'en')) {
      localStorage.setItem('language', loggedInUser.preferredLanguage);
      setLanguage(loggedInUser.preferredLanguage);
    }
    setUser(loggedInUser);
  };

  if (!authReady) return <div className="state">Loading...</div>;
  return <LanguageContext.Provider value={language}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />} />
      <Route path="*" element={user ? <Shell user={user} logout={logout} language={language} setLanguage={(v) => setLanguage(normalizeLanguage(v))} /> : <Navigate to="/login" />} />
    </Routes>
  </LanguageContext.Provider>;
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const t = useT();
  const [email, setEmail] = useState('admin@bikerental.ro'); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const submit = async (e: FormEvent) => { e.preventDefault(); setError(''); try {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    const { data } = await api.get<User>('/api/v1/auth/profile');
    localStorage.setItem('user', JSON.stringify(data)); onLogin(data);
  } catch (err) { setError(errorMessage(err)); } };
  return <main className="login-page"><form className="login-card" onSubmit={submit}>
    <div className="brand-mark"><Gauge size={25} /></div><h1>MotoRental Pro</h1><p className="muted">{t.login.subtitle}</p>
    <label>{t.login.email}<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
    <label>{t.login.password}<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
    {error && <div className="error">{error}</div>}<button className="primary full" type="submit">{t.login.signIn} <ChevronRight size={17} /></button>
  </form></main>;
}

function Shell({ user, logout, language, setLanguage }: { user: User; logout: () => void | Promise<void>; language: string; setLanguage: (v: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false); const location = useLocation();
  const activeNavKey = nav.find(n => location.pathname.startsWith(n[0]))?.[1];
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-brand"><div className="brand-mark small"><Gauge size={19} /></div><strong>MotoRental</strong><button className="icon mobile-only" onClick={() => setOpen(false)}><X /></button></div>
      <nav>{nav.map(([path, key, Icon]) => <Link key={path} to={path} onClick={() => setOpen(false)} className={location.pathname.startsWith(path) ? 'active' : ''}><Icon size={18} />{t.nav[key]}</Link>)}</nav>
      <div className="sidebar-footer"><Link to="/more"><ShieldCheck size={18} />{t.nav.account}</Link><button onClick={logout}><LogOut size={18} />{t.nav.signOut}</button></div>
    </aside>
    <section className="main"><header><button className="icon mobile-only" onClick={() => setOpen(true)}><Menu /></button><div><span className="eyebrow">{t.nav.eyebrow}</span><strong>{activeNavKey ? t.nav[activeNavKey] : t.nav.account}</strong></div><div className="user-chip"><span>{user.fullName?.[0] || 'O'}</span><div><b>{user.fullName}</b><small>{user.email}</small></div></div></header>
      <Routes><Route path="/dashboard" element={<Dashboard />} /><Route path="/bikes" element={<Bikes />} /><Route path="/customers" element={<Customers />} /><Route path="/rentals" element={<Rentals />} /><Route path="/payments" element={<Payments />} /><Route path="/servicing" element={<Servicing />} /><Route path="/inventory" element={<Inventory />} /><Route path="/reports" element={<Reports language={language} />} /><Route path="/settings" element={<SettingsPage language={language} setLanguage={setLanguage} />} /><Route path="/more" element={<More user={user} logout={logout} />} /><Route path="*" element={<Navigate to="/dashboard" />} /></Routes>
    </section>
  </div>;
}

function useResource<T>(path: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T[]>([]);
  const [pageInfo, setPageInfo] = useState<Omit<PageResult<T>, 'content'>>({
    pageNumber: 0,
    pageSize: 100,
    totalElements: 0,
    totalPages: 0,
    last: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);
  const serializedParams = JSON.stringify(params);

  const refresh = async () => {
    const reqId = requestIdRef.current + 1;
    requestIdRef.current = reqId;
    setLoading(true);
    setError('');
    try {
      const result = await listPage<T>(path, params);
      if (requestIdRef.current !== reqId) return;
      setData(result.content);
      setPageInfo({
        pageNumber: result.pageNumber,
        pageSize: result.pageSize,
        totalElements: result.totalElements,
        totalPages: result.totalPages,
        last: result.last,
      });
    } catch (e) {
      if (requestIdRef.current !== reqId) return;
      setData([]);
      setError(errorMessage(e));
    } finally {
      if (requestIdRef.current === reqId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void refresh();
  }, [path, serializedParams]);

  return { data, pageInfo, loading, error, refresh };
}
function PaginationControls({
  page,
  pageInfo,
  loading,
  onPageChange,
}: {
  page: number;
  pageInfo: { pageNumber: number; pageSize: number; totalElements: number; totalPages: number; last: boolean };
  loading: boolean;
  onPageChange: (nextPage: number) => void;
}) {
  const t = useT();
  if (loading || (pageInfo.totalElements === 0 && pageInfo.totalPages === 0 && page === 0)) {
    return null;
  }
  const displayPage = pageInfo.totalPages > 0 ? pageInfo.pageNumber + 1 : page + 1;
  const displayTotalPages = Math.max(1, pageInfo.totalPages);
  const isFirst = page <= 0;
  const isLast = pageInfo.last || (pageInfo.totalPages > 0 && page + 1 >= pageInfo.totalPages);

  return (
    <div className="pagination-bar">
      <span className="muted">
        {t.pagination.totalRecords}: <strong>{pageInfo.totalElements}</strong>
      </span>
      <div className="pagination-actions">
        <Button
          secondary
          disabled={loading || isFirst}
          onClick={() => {
            if (!loading && !isFirst) onPageChange(page - 1);
          }}
        >
          {t.pagination.previous}
        </Button>
        <span className="muted">
          {t.pagination.page} <strong>{displayPage}</strong> {t.pagination.of} <strong>{displayTotalPages}</strong>
        </span>
        <Button
          secondary
          disabled={loading || isLast}
          onClick={() => {
            if (!loading && !isLast) onPageChange(page + 1);
          }}
        >
          {t.pagination.next}
        </Button>
      </div>
    </div>
  );
}
function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) { return <main className="content"><div className="page-heading"><div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>{action}</div>{children}</main>; }
function State({ loading, error, empty, children }: { loading: boolean; error: string; empty: boolean; children: React.ReactNode }) { const t = useT(); if (loading) return <div className="state">{t.common.loading}</div>; if (error) return <div className="state error"><AlertTriangle size={18} />{error}</div>; if (empty) return <div className="state">{t.common.noRecords}</div>; return <>{children}</>; }
function Button({ children, onClick, secondary = false, danger = false, type = 'button', disabled = false }: { children: React.ReactNode; onClick?: () => void; secondary?: boolean; danger?: boolean; type?: 'button' | 'submit'; disabled?: boolean }) { return <button type={type} disabled={disabled} className={danger ? 'danger' : secondary ? 'secondary' : 'primary'} onClick={onClick}>{children}</button>; }
function Table({ columns, rows, onRow }: { columns: string[]; rows: RecordData[]; onRow?: (r: RecordData) => void }) { const t = useT(); return <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{t.columns[c] ?? c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.id || i} onClick={() => onRow?.(r)}>{columns.map(c => <td key={c}>{String(r[c] ?? '—')}</td>)}</tr>)}</tbody></table></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { const t = useT(); return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h2>{title}</h2><button type="button" className="icon" aria-label={t.common.close} onClick={onClose}><X /></button></div>{children}</div></div>; }
function Fields({ fields, values, setValues }: { fields: FormField[]; values: RecordData; setValues: (v: RecordData) => void }) { const t = useT(); return <div className="form-grid">{fields.map(f => <label key={f.key} className={f.type === 'textarea' ? 'full-span' : undefined}>{f.label}{f.selectOptions || f.options ? <select required={f.required} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })}><option value="">{t.common.selectPlaceholder}</option>{f.selectOptions ? f.selectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : f.options?.map(o => <option key={o}>{o}</option>)}</select> : f.type === 'textarea' ? <textarea rows={3} required={f.required} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} /> : <input required={f.required} type={f.type || 'text'} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />}</label>)}</div>; }

function Dashboard() {
  const t = useT();
  const [kpi, setKpi] = useState<RecordData | null>(null); const [util, setUtil] = useState<RecordData | null>(null); const [error, setError] = useState('');
  useEffect(() => { Promise.all([api.get('/api/v1/reports/dashboard'), api.get('/api/v1/reports/fleet-utilization')]).then(([a, b]) => { setKpi(a.data); setUtil(b.data); }).catch(e => setError(errorMessage(e))); }, []);
  const cards = kpi ? [[t.dashboard.activeRentals, kpi.activeRentalsCount, ClipboardList], [t.dashboard.availableFleet, kpi.availableBikesCount, Bike], [t.dashboard.inService, kpi.inServiceBikesCount, Wrench], [t.dashboard.overdueCharges, kpi.overdueChargesCount, AlertTriangle]] as const : [];
  return <Page title={t.dashboard.title} subtitle={t.dashboard.subtitle}><State loading={!kpi && !error} error={error} empty={false}><div className="kpi-grid">{cards.map(([label, value, Icon]) => <div className="kpi" key={label}><div className="kpi-icon"><Icon size={19} /></div><span>{label}</span><strong>{value}</strong></div>)}</div><div className="panel-grid"><div className="panel"><div className="panel-title"><div><h2>{t.dashboard.revenueByCurrency}</h2><p className="muted">{t.dashboard.currentPeriod}</p></div><CircleDollarSign /></div><div className="money-list">{currencies.map(c => <div key={c}><b>{c}</b><strong>{Number(kpi?.monthlyRevenue?.[c] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>)}</div></div><div className="panel"><div className="panel-title"><div><h2>{t.dashboard.fleetUtilization}</h2><p className="muted">{t.dashboard.backendCalculated}</p></div><BarChart3 /></div><div className="util-value">{Number(util?.utilizationRate || 0).toFixed(1)}<small>%</small></div><div className="progress"><span style={{ width: `${Math.min(100, Number(util?.utilizationRate || 0))}%` }} /></div></div></div><div className="alert-strip"><CheckCircle2 size={18} /><span><b>{kpi?.lowStockPartsCount || 0}</b> {t.dashboard.lowStockPrefix}</span><Link to="/inventory">{t.dashboard.reviewInventory} <ChevronRight size={15} /></Link></div></State></Page>;
}

function normalize(values: RecordData, fields: FormField[]) { const out = { ...values }; fields.forEach(f => { if (!f.required && out[f.key] === '') { delete out[f.key]; } else if (['number', 'date'].includes(f.type || '') && out[f.key] !== '' && out[f.key] !== undefined) { out[f.key] = f.type === 'number' ? Number(out[f.key]) : out[f.key]; } }); return out; }
function displayVal(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function Bikes() {
  const t = useT();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(0);
  const queryParams = useMemo(
    () => ({
      page,
      size: 100,
      ...(search ? { search } : {}),
      ...(includeArchived ? { includeArchived: true } : {}),
    }),
    [page, search, includeArchived],
  );
  const resource = useResource<RecordData>('/api/v1/bikes', queryParams);

  const [createModal, setCreateModal] = useState(false);
  const [createValues, setCreateValues] = useState<RecordData>({});
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  const [selectedBike, setSelectedBike] = useState<RecordData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<RecordData>({});
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const createFields: FormField[] = [
    { key: 'registrationNumber', label: t.bikes.registrationNumber, required: true },
    { key: 'vin', label: t.bikes.vin, required: true },
    { key: 'make', label: t.bikes.make, required: true },
    { key: 'model', label: t.bikes.model, required: true },
    { key: 'manufactureYear', label: t.bikes.manufactureYear, type: 'number', required: true },
    { key: 'currentOdometer', label: t.bikes.odometer, type: 'number', required: true },
    { key: 'serviceIntervalDays', label: t.bikes.serviceIntervalDays, type: 'number', required: true },
  ];

  const editFields: FormField[] = [
    ...createFields,
    { key: 'itpExpiryDate', label: t.bikes.itpExpiryDate, type: 'date' },
    { key: 'rcaExpiryDate', label: t.bikes.rcaExpiryDate, type: 'date' },
    { key: 'cascoExpiryDate', label: t.bikes.cascoExpiryDate, type: 'date' },
    { key: 'notes', label: t.common.notes },
  ];

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setPage(0);
    setSearch(trimmed);
  };

  const clearSearch = () => {
    setSearchInput('');
    setIncludeArchived(false);
    setPage(0);
    setSearch('');
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (createSaving) return;
    setCreateError('');
    setCreateSaving(true);
    try {
      await api.post('/api/v1/bikes', normalize(createValues, createFields));
      setCreateModal(false);
      setCreateValues({});
      await resource.refresh();
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreateSaving(false);
    }
  };

  const openEdit = () => {
    if (!selectedBike || archiveSaving) return;
    setEditError('');
    setSuccessMessage('');
    setConfirmArchive(false);
    setEditValues({
      registrationNumber: selectedBike.registrationNumber ?? '',
      vin: selectedBike.vin ?? '',
      make: selectedBike.make ?? '',
      model: selectedBike.model ?? '',
      manufactureYear: String(selectedBike.manufactureYear ?? selectedBike.yearOfManufacture ?? ''),
      currentOdometer: String(selectedBike.currentOdometer ?? ''),
      serviceIntervalDays: String(selectedBike.serviceIntervalDays ?? ''),
      itpExpiryDate: selectedBike.itpExpiryDate ?? '',
      rcaExpiryDate: selectedBike.rcaExpiryDate ?? '',
      cascoExpiryDate: selectedBike.cascoExpiryDate ?? '',
      notes: selectedBike.notes ?? '',
    });
    setEditing(true);
  };

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBike || editSaving) return;
    setEditError('');

    const year = Number(editValues.manufactureYear);
    const odometer = Number(editValues.currentOdometer);
    const interval = Number(editValues.serviceIntervalDays);
    if (!Number.isInteger(year) || year < 1990 || year > 2050) {
      setEditError(t.bikes.errYear);
      return;
    }
    if (!Number.isFinite(odometer) || odometer < 0) {
      setEditError(t.bikes.errOdometer);
      return;
    }
    if (!Number.isInteger(interval) || interval < 1) {
      setEditError(t.bikes.errInterval);
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        ...normalize(editValues, editFields),
        ...(selectedBike.status ? { status: selectedBike.status } : {}),
      };
      const { data } = await api.put(`/api/v1/bikes/${selectedBike.id}`, payload);
      setSelectedBike(data);
      setEditing(false);
      setSuccessMessage(t.bikes.updated);
      await resource.refresh();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setEditSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!selectedBike || archiveSaving) return;
    setEditError('');
    setSuccessMessage('');
    setArchiveSaving(true);
    try {
      const action = selectedBike.archived ? 'unarchive' : 'archive';
      const { data } = await api.post(`/api/v1/bikes/${selectedBike.id}/${action}`);
      setSelectedBike(data);
      setConfirmArchive(false);
      setSuccessMessage(data.archived ? t.bikes.archivedMsg : t.bikes.unarchivedMsg);
      await resource.refresh();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setArchiveSaving(false);
    }
  };

  return (
    <Page
      title={t.bikes.title}
      subtitle={t.bikes.subtitle}
      action={<Button onClick={() => { setCreateError(''); setCreateModal(true); }}><Plus size={17} />{t.bikes.registerButton}</Button>}
    >
      <form className="report-filters" onSubmit={submitSearch}>
        <label style={{ flex: '1 1 260px', maxWidth: 380 }}>
          {t.bikes.searchLabel}
          <input
            type="search"
            placeholder={t.bikes.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setPage(0);
              setIncludeArchived(e.target.checked);
            }}
          />
          {t.bikes.showArchived}
        </label>
        <Button type="submit">{t.common.search}</Button>
        {(searchInput || search || includeArchived) && (
          <Button secondary onClick={clearSearch}>{t.common.clear}</Button>
        )}
      </form>

      {successMessage && <div className="success">{successMessage}</div>}

      <State loading={resource.loading} error={resource.error} empty={!resource.data.length}>
        <Table
          columns={['registrationNumber', 'make', 'model', 'status', 'currentOdometer']}
          rows={resource.data}
          onRow={(bike) => {
            setSelectedBike(bike);
            setEditing(false);
            setConfirmArchive(false);
            setEditError('');
            setSuccessMessage('');
          }}
        />
      </State>
      <PaginationControls page={page} pageInfo={resource.pageInfo} loading={resource.loading} onPageChange={setPage} />

      {createModal && (
        <Modal title={t.bikes.registerButton} onClose={() => setCreateModal(false)}>
          <form onSubmit={submitCreate}>
            <Fields fields={createFields} values={createValues} setValues={setCreateValues} />
            {createError && <div className="error">{createError}</div>}
            <div className="modal-actions">
              <Button secondary onClick={() => setCreateModal(false)} disabled={createSaving}>{t.common.cancel}</Button>
              <Button type="submit" disabled={createSaving}>{createSaving ? t.common.saving : t.common.save}</Button>
            </div>
          </form>
        </Modal>
      )}

      {selectedBike && (
        <Modal
          title={editing ? `${t.bikes.editPrefix} ${selectedBike.registrationNumber}` : `${selectedBike.registrationNumber} — ${selectedBike.make} ${selectedBike.model}`}
          onClose={() => { if (!editSaving && !archiveSaving) { setSelectedBike(null); setEditing(false); setConfirmArchive(false); setEditError(''); } }}
        >
          {successMessage && !editing && <div className="success">{successMessage}</div>}
          {!editing ? (
            <>
              <div className="detail-grid">
                <div><span>{t.bikes.registrationNumber}</span><strong>{displayVal(selectedBike.registrationNumber)}</strong></div>
                <div><span>{t.bikes.vinShort}</span><strong>{displayVal(selectedBike.vin)}</strong></div>
                <div><span>{t.bikes.make}</span><strong>{displayVal(selectedBike.make)}</strong></div>
                <div><span>{t.bikes.model}</span><strong>{displayVal(selectedBike.model)}</strong></div>
                <div><span>{t.bikes.manufactureYear}</span><strong>{displayVal(selectedBike.manufactureYear ?? selectedBike.yearOfManufacture)}</strong></div>
                <div><span>{t.common.status}</span><strong>{displayVal(selectedBike.status)}</strong></div>
                <div><span>{t.bikes.currentOdometer}</span><strong>{displayVal(selectedBike.currentOdometer)}</strong></div>
                <div><span>{t.bikes.serviceIntervalDays}</span><strong>{displayVal(selectedBike.serviceIntervalDays)}</strong></div>
                <div><span>{t.bikes.itpExpiryDate}</span><strong>{displayVal(selectedBike.itpExpiryDate)}</strong></div>
                <div><span>{t.bikes.rcaExpiryDate}</span><strong>{displayVal(selectedBike.rcaExpiryDate)}</strong></div>
                <div><span>{t.bikes.cascoExpiryDate}</span><strong>{displayVal(selectedBike.cascoExpiryDate)}</strong></div>
                <div><span>{t.bikes.nextServiceDueDate}</span><strong>{displayVal(selectedBike.nextServiceDueDate)}</strong></div>
                <div><span>{t.common.notes}</span><strong>{displayVal(selectedBike.notes)}</strong></div>
                <div><span>{t.common.archivedStatus}</span><strong>{selectedBike.archived ? t.common.archived : t.common.active}</strong></div>
              </div>
              {editError && <div className="error" style={{ marginTop: 14 }}>{editError}</div>}
              {confirmArchive && (
                <div className="error" style={{ marginTop: 14 }}>
                  {selectedBike.archived ? t.bikes.unarchivePrompt : t.bikes.archivePrompt}
                </div>
              )}
              <div className="modal-actions">
                <Button secondary onClick={() => { setSelectedBike(null); setConfirmArchive(false); setEditError(''); }} disabled={archiveSaving}>{t.common.close}</Button>
                {confirmArchive ? (
                  <>
                    <Button secondary onClick={() => setConfirmArchive(false)} disabled={archiveSaving}>
                      {selectedBike.archived ? t.bikes.cancelUnarchive : t.bikes.cancelArchive}
                    </Button>
                    {selectedBike.archived ? (
                      <Button onClick={() => void toggleArchive()} disabled={archiveSaving}>
                        {archiveSaving ? t.bikes.unarchiving : t.bikes.confirmUnarchiveBtn}
                      </Button>
                    ) : (
                      <Button danger onClick={() => void toggleArchive()} disabled={archiveSaving}>
                        {archiveSaving ? t.bikes.archiving : t.bikes.confirmArchiveBtn}
                      </Button>
                    )}
                  </>
                ) : selectedBike.archived ? (
                  <Button secondary onClick={() => { setEditError(''); setConfirmArchive(true); }}>
                    {t.bikes.unarchive}
                  </Button>
                ) : (
                  <Button secondary onClick={() => { setEditError(''); setConfirmArchive(true); }}>
                    <Archive size={15} />{t.bikes.archive}
                  </Button>
                )}
                <Button onClick={openEdit} disabled={archiveSaving}>{t.common.edit}</Button>
              </div>
            </>
          ) : (
            <form onSubmit={submitEdit}>
              <Fields fields={editFields} values={editValues} setValues={setEditValues} />
              {editError && <div className="error">{editError}</div>}
              <div className="modal-actions">
                <Button secondary onClick={() => { setEditing(false); setEditError(''); }} disabled={editSaving}>{t.common.cancel}</Button>
                <Button type="submit" disabled={editSaving}>{editSaving ? t.common.saving : t.common.saveChanges}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </Page>
  );
}
function Customers() {
  const t = useT();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(0);
  const queryParams = useMemo(
    () => ({
      page,
      size: 100,
      ...(search ? { search } : {}),
      ...(includeArchived ? { includeArchived: true } : {}),
    }),
    [page, search, includeArchived],
  );
  const resource = useResource<RecordData>('/api/v1/customers', queryParams);

  const [createModal, setCreateModal] = useState(false);
  const [createValues, setCreateValues] = useState<RecordData>({});
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<RecordData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<RecordData>({});
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [balanceSummary, setBalanceSummary] = useState<RecordData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  const createFields: FormField[] = [
    { key: 'fullName', label: t.customers.fullName, required: true },
    { key: 'phone', label: t.customers.phone, required: true },
    { key: 'email', label: t.customers.email, type: 'email' },
    { key: 'cnpOrTaxId', label: t.customers.cnpOrTaxId },
    { key: 'drivingLicenceNumber', label: t.customers.drivingLicenceNumber },
    { key: 'licenceCategories', label: t.customers.licenceCategories },
    { key: 'licenceExpiryDate', label: t.customers.licenceExpiry, type: 'date' },
    { key: 'livingCity', label: t.customers.livingCity },
    { key: 'address', label: t.customers.address },
  ];

  const editFields: FormField[] = [
    ...createFields,
    { key: 'notes', label: t.common.notes },
  ];

  const loadBalanceSummary = async (customerId: string) => {
    setBalanceLoading(true);
    setBalanceError('');
    setBalanceSummary(null);
    try {
      const { data } = await api.get(`/api/v1/customers/${customerId}/balance-summary`);
      setBalanceSummary(data);
    } catch (err) {
      setBalanceError(errorMessage(err));
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCustomer?.id) {
      void loadBalanceSummary(String(selectedCustomer.id));
    }
  }, [selectedCustomer?.id]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setIncludeArchived(false);
    setPage(0);
    setSearch('');
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (createSaving) return;
    setCreateError('');
    setCreateSaving(true);
    try {
      await api.post('/api/v1/customers', normalize(createValues, createFields));
      setCreateModal(false);
      setCreateValues({});
      await resource.refresh();
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreateSaving(false);
    }
  };

  const openEdit = () => {
    if (!selectedCustomer) return;
    setEditError('');
    setSuccessMessage('');
    setConfirmArchive(false);
    setEditValues({
      fullName: selectedCustomer.fullName ?? '',
      phone: selectedCustomer.phone ?? '',
      email: selectedCustomer.email ?? '',
      cnpOrTaxId: selectedCustomer.cnpOrTaxId ?? '',
      drivingLicenceNumber: selectedCustomer.drivingLicenceNumber ?? '',
      licenceCategories: selectedCustomer.licenceCategories ?? '',
      licenceExpiryDate: selectedCustomer.licenceExpiryDate ?? '',
      livingCity: selectedCustomer.livingCity ?? '',
      address: selectedCustomer.address ?? '',
      notes: selectedCustomer.notes ?? '',
    });
    setEditing(true);
  };

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || editSaving) return;
    setEditError('');

    const fullName = String(editValues.fullName ?? '').trim();
    const phone = String(editValues.phone ?? '').trim();
    if (fullName.length < 1 || fullName.length > 150) {
      setEditError(t.customers.errFullName);
      return;
    }
    if (phone.length < 8 || phone.length > 30) {
      setEditError(t.customers.errPhone);
      return;
    }

    setEditSaving(true);
    try {
      const payload = normalize(editValues, editFields);
      const { data } = await api.put(`/api/v1/customers/${selectedCustomer.id}`, payload);
      setSelectedCustomer(data);
      setEditing(false);
      setSuccessMessage(t.customers.updated);
      await Promise.all([resource.refresh(), loadBalanceSummary(String(selectedCustomer.id))]);
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setEditSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!selectedCustomer || archiveSaving) return;
    setEditError('');
    setSuccessMessage('');
    setArchiveSaving(true);
    try {
      const action = selectedCustomer.archived ? 'unarchive' : 'archive';
      const { data } = await api.post(`/api/v1/customers/${selectedCustomer.id}/${action}`);
      setSelectedCustomer(data);
      setConfirmArchive(false);
      setSuccessMessage(data.archived ? t.customers.archivedMsg : t.customers.unarchivedMsg);
      await resource.refresh();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setArchiveSaving(false);
    }
  };

  return (
    <Page
      title={t.customers.title}
      subtitle={t.customers.subtitle}
      action={<Button onClick={() => { setCreateError(''); setCreateModal(true); }}><Plus size={17} />{t.customers.registerButton}</Button>}
    >
      <form className="report-filters" onSubmit={submitSearch}>
        <label style={{ flex: '1 1 260px', maxWidth: 380 }}>
          {t.customers.searchLabel}
          <input
            type="search"
            placeholder={t.customers.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked);
              setPage(0);
            }}
          />
          {t.customers.includeArchived}
        </label>
        <Button type="submit">{t.common.search}</Button>
        {(searchInput || search || includeArchived) && (
          <Button secondary onClick={clearSearch}>{t.common.clear}</Button>
        )}
      </form>

      {successMessage && <div className="success">{successMessage}</div>}

      <State loading={resource.loading} error={resource.error} empty={!resource.data.length}>
        <Table
          columns={['fullName', 'phone', 'email', 'archived']}
          rows={resource.data}
          onRow={(customer) => {
            setSelectedCustomer(customer);
            setEditing(false);
            setConfirmArchive(false);
            setEditError('');
            setSuccessMessage('');
          }}
        />
      </State>
      <PaginationControls page={page} pageInfo={resource.pageInfo} loading={resource.loading} onPageChange={setPage} />

      {createModal && (
        <Modal title={t.customers.registerButton} onClose={() => setCreateModal(false)}>
          <form onSubmit={submitCreate}>
            <Fields fields={createFields} values={createValues} setValues={setCreateValues} />
            {createError && <div className="error">{createError}</div>}
            <div className="modal-actions">
              <Button secondary onClick={() => setCreateModal(false)} disabled={createSaving}>{t.common.cancel}</Button>
              <Button type="submit" disabled={createSaving}>{createSaving ? t.common.saving : t.common.save}</Button>
            </div>
          </form>
        </Modal>
      )}

      {selectedCustomer && (
        <Modal
          title={editing ? `Edit ${selectedCustomer.fullName}` : String(selectedCustomer.fullName ?? 'Customer details')}
          onClose={() => { setSelectedCustomer(null); setEditing(false); setConfirmArchive(false); setEditError(''); }}
        >
          {successMessage && !editing && <div className="success">{successMessage}</div>}
          {!editing ? (
            <>
              <div className="detail-grid">
                <div><span>{t.customers.fullName}</span><strong>{displayVal(selectedCustomer.fullName)}</strong></div>
                <div><span>{t.customers.phone}</span><strong>{displayVal(selectedCustomer.phone)}</strong></div>
                <div><span>{t.customers.email}</span><strong>{displayVal(selectedCustomer.email)}</strong></div>
                <div><span>{t.customers.cnpOrTaxId}</span><strong>{displayVal(selectedCustomer.cnpOrTaxId)}</strong></div>
                <div><span>{t.customers.dateOfBirth}</span><strong>{displayVal(selectedCustomer.dateOfBirth)}</strong></div>
                <div><span>{t.customers.livingCity}</span><strong>{displayVal(selectedCustomer.livingCity)}</strong></div>
                <div><span>{t.customers.address}</span><strong>{displayVal(selectedCustomer.address)}</strong></div>
                <div><span>{t.customers.drivingLicenceNumber}</span><strong>{displayVal(selectedCustomer.drivingLicenceNumber)}</strong></div>
                <div><span>{t.customers.licenceCategories}</span><strong>{displayVal(selectedCustomer.licenceCategories)}</strong></div>
                <div><span>{t.customers.licenceExpiryDate}</span><strong>{displayVal(selectedCustomer.licenceExpiryDate)}</strong></div>
                <div><span>{t.customers.gdprConsentDate}</span><strong>{displayVal(selectedCustomer.gdprConsentDate)}</strong></div>
                <div><span>{t.common.notes}</span><strong>{displayVal(selectedCustomer.notes)}</strong></div>
                <div><span>{t.common.archivedStatus}</span><strong>{selectedCustomer.archived ? t.common.archived : t.common.active}</strong></div>
              </div>

              <div className="parts-section">
                <div className="parts-section-header">
                  <strong>{t.customers.balanceSummary}</strong>
                </div>
                {balanceLoading && <div className="muted">{t.customers.loadingBalance}</div>}
                {balanceError && <div className="error">{balanceError}</div>}
                {!balanceLoading && !balanceError && balanceSummary?.balances && (
                  <div className="balance-grid">
                    {currencies.map((curr) => {
                      const entry = balanceSummary.balances[curr];
                      if (!entry) return null;
                      return (
                        <div className="balance-card" key={curr}>
                          <b>{curr}</b>
                          <div><span>{t.customers.billed}</span><strong>{Number(entry.totalBilled).toFixed(2)}</strong></div>
                          <div><span>{t.customers.paid}</span><strong>{Number(entry.totalPaid).toFixed(2)}</strong></div>
                          <div><span>{t.customers.outstanding}</span><strong>{Number(entry.totalOutstanding).toFixed(2)}</strong></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {editError && <div className="error" style={{ marginTop: 14 }}>{editError}</div>}

              {confirmArchive && !selectedCustomer.archived && (
                <div className="error" style={{ marginTop: 14 }}>
                  {t.customers.archivePrompt}
                </div>
              )}

              <div className="modal-actions">
                <Button secondary onClick={() => setSelectedCustomer(null)}>{t.common.close}</Button>
                {selectedCustomer.archived ? (
                  <Button secondary onClick={() => void toggleArchive()} disabled={archiveSaving}>
                    {archiveSaving ? t.customers.unarchiving : t.customers.unarchive}
                  </Button>
                ) : confirmArchive ? (
                  <>
                    <Button secondary onClick={() => setConfirmArchive(false)} disabled={archiveSaving}>{t.customers.cancelArchive}</Button>
                    <Button danger onClick={() => void toggleArchive()} disabled={archiveSaving}>
                      {archiveSaving ? t.customers.archiving : t.customers.confirmArchiveBtn}
                    </Button>
                  </>
                ) : (
                  <Button secondary onClick={() => setConfirmArchive(true)}>
                    <Archive size={15} />{t.customers.archive}
                  </Button>
                )}
                <Button onClick={openEdit}>{t.common.edit}</Button>
              </div>
            </>
          ) : (
            <form onSubmit={submitEdit}>
              <Fields fields={editFields} values={editValues} setValues={setEditValues} />
              {editError && <div className="error">{editError}</div>}
              <div className="modal-actions">
                <Button secondary onClick={() => { setEditing(false); setEditError(''); }} disabled={editSaving}>{t.common.cancel}</Button>
                <Button type="submit" disabled={editSaving}>{editSaving ? t.common.saving : t.common.saveChanges}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </Page>
  );
}
function Rentals() {
  const t = useT();
  const [statusInput, setStatusInput] = useState('');
  const [customerIdInput, setCustomerIdInput] = useState('');
  const [bikeIdInput, setBikeIdInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerIdFilter, setCustomerIdFilter] = useState('');
  const [bikeIdFilter, setBikeIdFilter] = useState('');
  const [page, setPage] = useState(0);

  const queryParams = useMemo(
    () => ({
      page,
      size: 100,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(customerIdFilter ? { customerId: customerIdFilter } : {}),
      ...(bikeIdFilter ? { bikeId: bikeIdFilter } : {}),
    }),
    [page, statusFilter, customerIdFilter, bikeIdFilter],
  );

  const resource = useResource<RecordData>('/api/v1/rentals', queryParams);
  const customers = useResource<RecordData>('/api/v1/customers', { page: 0, size: 100 });
  const bikes = useResource<RecordData>('/api/v1/bikes', { page: 0, size: 100 });

  const [modal, setModal] = useState(false);
  const [selectedRental, setSelectedRental] = useState<RecordData | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'payment' | 'close'>('view');

  const [createValues, setCreateValues] = useState<RecordData>({});
  const [editValues, setEditValues] = useState<RecordData>({});
  const [paymentValues, setPaymentValues] = useState<RecordData>({});
  const [closeValues, setCloseValues] = useState<RecordData>({});

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);

  const [charges, setCharges] = useState<RecordData[]>([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargesError, setChargesError] = useState('');
  const [rentalPayments, setRentalPayments] = useState<RecordData[]>([]);
  const [rentalPaymentsLoading, setRentalPaymentsLoading] = useState(false);
  const [rentalPaymentsError, setRentalPaymentsError] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [generatingNext, setGeneratingNext] = useState(false);
  const [generatingUpToDate, setGeneratingUpToDate] = useState(false);
  const [chargeActionError, setChargeActionError] = useState('');
  const [chargeActionSuccess, setChargeActionSuccess] = useState('');

  const customerOptions = customers.data.filter(customer => !customer.archived).map(customer => ({
    value: customer.id,
    label: `${customer.fullName} (${customer.phone})`,
  }));
  const allCustomerFilterOptions = customers.data.map(customer => ({
    value: customer.id,
    label: `${customer.fullName} (${customer.phone})`,
  }));
  const allBikeFilterOptions = bikes.data.map(bike => ({
    value: bike.id,
    label: `${bike.registrationNumber} — ${bike.make} ${bike.model}`,
  }));
  const createBikeOptions = bikes.data
    .filter(bike => !bike.archived && bike.status === 'AVAILABLE')
    .map(bike => ({
      value: bike.id,
      label: `${bike.registrationNumber} — ${bike.make} ${bike.model}`,
    }));
  const editBikeOptions = bikes.data
    .filter(bike => !bike.archived && (bike.status === 'AVAILABLE' || bike.id === selectedRental?.bikeId))
    .map(bike => ({
      value: bike.id,
      label: `${bike.registrationNumber} — ${bike.make} ${bike.model}`,
    }));

  const fields: FormField[] = [
    { key: 'customerId', label: t.rentals.customer, required: true, selectOptions: customerOptions },
    { key: 'motorbikeId', label: t.rentals.bike, required: true, selectOptions: createBikeOptions },
    { key: 'startDate', label: t.rentals.startDate, type: 'date', required: true },
    { key: 'plannedEndDate', label: t.rentals.plannedEndDate, type: 'date' },
    { key: 'weeklyRate', label: t.rentals.weeklyRate, type: 'number', required: true },
    { key: 'currency', label: t.common.currency, options: currencies, required: true },
    { key: 'depositAmount', label: t.rentals.deposit, type: 'number' },
    { key: 'depositCurrency', label: t.rentals.depositCurrency, options: currencies },
    { key: 'termsAndNotes', label: t.rentals.termsAndNotes },
  ];
  const editFields: FormField[] = [
    { key: 'motorbikeId', label: t.rentals.bike, required: true, selectOptions: editBikeOptions },
    { key: 'startDate', label: t.rentals.startDate, type: 'date', required: true },
    { key: 'plannedEndDate', label: t.rentals.plannedEndDate, type: 'date' },
    { key: 'weeklyRate', label: t.rentals.weeklyRate, type: 'number', required: true },
    { key: 'currency', label: t.common.currency, options: currencies, required: true },
    { key: 'depositAmount', label: t.rentals.deposit, type: 'number' },
    { key: 'depositCurrency', label: t.rentals.depositCurrency, options: currencies },
    { key: 'termsAndNotes', label: t.rentals.termsAndNotes },
  ];
  const paymentFields: FormField[] = [
    { key: 'paymentDate', label: t.rentals.paymentDate, type: 'date', required: true },
    { key: 'amount', label: t.rentals.amount, type: 'number', required: true },
    { key: 'currency', label: t.common.currency, options: currencies, required: true },
    { key: 'paymentMethod', label: t.rentals.paymentMethod, options: ['CASH', 'BANK_TRANSFER'], required: true },
    { key: 'referenceNumber', label: t.rentals.referenceNumber },
    { key: 'notes', label: t.common.notes },
  ];
  const closeFields: FormField[] = [
    { key: 'closureDate', label: t.rentals.closureDate, type: 'date', required: true },
    { key: 'notes', label: t.rentals.closureNotes },
  ];

  const submitFilters = (e: FormEvent) => {
    e.preventDefault();
    setPage(0);
    setStatusFilter(statusInput);
    setCustomerIdFilter(customerIdInput);
    setBikeIdFilter(bikeIdInput);
  };

  const clearFilters = () => {
    setStatusInput('');
    setCustomerIdInput('');
    setBikeIdInput('');
    setPage(0);
    setStatusFilter('');
    setCustomerIdFilter('');
    setBikeIdFilter('');
  };

  const openCreateModal = () => {
    setCreateValues({});
    setFormError('');
    setSuccessMessage('');
    setModal(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (createSaving) return;
    setFormError('');
    setCreateSaving(true);
    try {
      await api.post('/api/v1/rentals', normalize(createValues, fields));
      setModal(false);
      setCreateValues({});
      setSuccessMessage(t.rentals.createdMsg);
      await Promise.all([resource.refresh(), bikes.refresh()]);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setCreateSaving(false);
    }
  };

  const openRental = (rental: RecordData) => {
    setSelectedRental(rental);
    setMode('view');
    setFormError('');
    setSuccessMessage('');
  };

  const closeDetails = () => {
    setSelectedRental(null);
    setMode('view');
    setFormError('');
  };

  const startEdit = () => {
    if (!selectedRental || selectedRental.status !== 'ACTIVE') return;
    setEditValues({
      motorbikeId: selectedRental.bikeId ?? '',
      startDate: selectedRental.startDate ?? '',
      plannedEndDate: selectedRental.plannedEndDate || '',
      weeklyRate: selectedRental.weeklyRate ?? '',
      currency: selectedRental.currency ?? '',
      depositAmount: selectedRental.depositAmount ?? '',
      depositCurrency: selectedRental.depositCurrency ?? '',
      termsAndNotes: selectedRental.termsAndNotes || '',
    });
    setFormError('');
    setSuccessMessage('');
    setMode('edit');
  };

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRental || editSaving) return;
    setFormError('');
    setEditSaving(true);
    try {
      const { data } = await api.put(`/api/v1/rentals/${selectedRental.id}`, normalize(editValues, editFields));
      setSelectedRental(data);
      setEditValues({});
      setMode('view');
      setSuccessMessage(t.rentals.updatedMsg);
      await Promise.all([resource.refresh(), bikes.refresh()]);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setEditSaving(false);
    }
  };

  const startPayment = () => {
    if (!selectedRental || selectedRental.status !== 'ACTIVE') return;
    setPaymentValues({
      paymentDate: new Date().toISOString().slice(0, 10),
      currency: selectedRental.currency,
    });
    setFormError('');
    setSuccessMessage('');
    setMode('payment');
  };

  const loadCharges = async (rentalId: string) => {
    setChargesLoading(true);
    setChargesError('');
    try {
      const { data } = await api.get(`/api/v1/rental-charges/rental/${rentalId}`);
      setCharges(Array.isArray(data) ? data : []);
    } catch (err) {
      setCharges([]);
      setChargesError(errorMessage(err));
    } finally {
      setChargesLoading(false);
    }
  };

  const loadRentalPayments = async (rentalId: string) => {
    setRentalPaymentsLoading(true);
    setRentalPaymentsError('');
    try {
      const { data } = await api.get(`/api/v1/payments/rental/${rentalId}`);
      setRentalPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      setRentalPayments([]);
      setRentalPaymentsError(errorMessage(err));
    } finally {
      setRentalPaymentsLoading(false);
    }
  };

  const refreshSelectedRental = async (rentalId: string) => {
    const { data } = await api.get(`/api/v1/rentals/${rentalId}`);
    setSelectedRental(data);
    await resource.refresh();
  };

  useEffect(() => {
    if (!selectedRental?.id) {
      setCharges([]);
      setRentalPayments([]);
      setChargesError('');
      setRentalPaymentsError('');
      setChargeActionError('');
      setChargeActionSuccess('');
      return;
    }
    const id = String(selectedRental.id);
    setChargeActionError('');
    setChargeActionSuccess('');
    setTargetDate('');
    void Promise.all([loadCharges(id), loadRentalPayments(id)]);
  }, [selectedRental?.id]);

  const handleGenerateNext = async () => {
    if (!selectedRental || generatingNext || generatingUpToDate) return;
    setChargeActionError('');
    setChargeActionSuccess('');
    setGeneratingNext(true);
    try {
      const { data } = await api.post(`/api/v1/rental-charges/rental/${selectedRental.id}/generate-next`, {});
      setChargeActionSuccess(
        `${t.rentals.generatedSinglePrefix} #${data.chargeSequence} (${data.periodStartDate} → ${data.periodEndDate}).`,
      );
      await Promise.all([
        loadCharges(String(selectedRental.id)),
        refreshSelectedRental(String(selectedRental.id)),
      ]);
    } catch (err) {
      setChargeActionError(errorMessage(err));
    } finally {
      setGeneratingNext(false);
    }
  };

  const handleGenerateUpToDate = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRental || generatingNext || generatingUpToDate) return;
    setChargeActionError('');
    setChargeActionSuccess('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setChargeActionError(t.rentals.errTargetDate);
      return;
    }
    setGeneratingUpToDate(true);
    try {
      const { data } = await api.post(
        `/api/v1/rental-charges/rental/${selectedRental.id}/generate-up-to-date`,
        {},
        { params: { targetDate } },
      );
      const createdList = Array.isArray(data) ? data : [];
      setChargeActionSuccess(
        createdList.length > 0
          ? `${t.rentals.generatedMultiPrefix}: ${createdList.length} (${targetDate}).`
          : `${t.rentals.generatedNone} ${targetDate}.`,
      );
      await Promise.all([
        loadCharges(String(selectedRental.id)),
        refreshSelectedRental(String(selectedRental.id)),
      ]);
    } catch (err) {
      setChargeActionError(errorMessage(err));
    } finally {
      setGeneratingUpToDate(false);
    }
  };

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRental || paymentSaving) return;
    setFormError('');
    setPaymentSaving(true);
    try {
      await api.post('/api/v1/payments', {
        ...normalize(paymentValues, paymentFields),
        customerId: selectedRental.customerId,
        rentalId: selectedRental.id,
      });
      setPaymentValues({});
      setMode('view');
      setSuccessMessage(t.rentals.paymentRecordedMsg);
      await Promise.all([
        loadRentalPayments(String(selectedRental.id)),
        loadCharges(String(selectedRental.id)),
        refreshSelectedRental(String(selectedRental.id)),
      ]);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setPaymentSaving(false);
    }
  };

  const startClose = () => {
    if (!selectedRental || selectedRental.status !== 'ACTIVE') return;
    setCloseValues({ closureDate: new Date().toISOString().slice(0, 10) });
    setFormError('');
    setSuccessMessage('');
    setMode('close');
  };

  const submitClose = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRental || closeSaving) return;
    setFormError('');
    setCloseSaving(true);
    try {
      const { data } = await api.post(`/api/v1/rentals/${selectedRental.id}/close`, normalize(closeValues, closeFields));
      setSelectedRental(data);
      setCloseValues({});
      setMode('view');
      setSuccessMessage(t.rentals.closedMsg);
      await Promise.all([resource.refresh(), bikes.refresh()]);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setCloseSaving(false);
    }
  };

  const formLoading = customers.loading || bikes.loading;
  const formLoadError = customers.error || bikes.error;
  const hasActiveFilters = Boolean(
    statusInput || customerIdInput || bikeIdInput || statusFilter || customerIdFilter || bikeIdFilter,
  );

  return (
    <Page
      title={t.rentals.title}
      subtitle={t.rentals.subtitle}
      action={<Button onClick={openCreateModal}><Plus size={17} />{t.rentals.createButton}</Button>}
    >
      <form className="report-filters" onSubmit={submitFilters}>
        <label>
          {t.common.status}
          <select value={statusInput} onChange={(e) => setStatusInput(e.target.value)}>
            <option value="">{t.rentals.allStatuses}</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="CLOSED">CLOSED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>
        <label>
          {t.rentals.customer}
          <select value={customerIdInput} onChange={(e) => setCustomerIdInput(e.target.value)}>
            <option value="">{t.rentals.allCustomers}</option>
            {allCustomerFilterOptions.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label>
          {t.rentals.bike}
          <select value={bikeIdInput} onChange={(e) => setBikeIdInput(e.target.value)}>
            <option value="">{t.rentals.allBikes}</option>
            {allBikeFilterOptions.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </label>
        <Button type="submit">{t.common.search}</Button>
        {hasActiveFilters && <Button secondary onClick={clearFilters}>{t.common.clear}</Button>}
      </form>

      {successMessage && <div className="success">{successMessage}</div>}

      <State loading={resource.loading} error={resource.error} empty={!resource.data.length}>
        <Table columns={['customerName', 'bikeRegistrationNumber', 'startDate', 'status', 'currency', 'weeklyRate']} rows={resource.data} onRow={openRental} />
      </State>
      <PaginationControls page={page} pageInfo={resource.pageInfo} loading={resource.loading} onPageChange={setPage} />

      {modal && (
        <Modal title={t.rentals.createButton} onClose={() => !createSaving && setModal(false)}>
          {formLoading ? <div className="state">{t.rentals.loadingRefs}</div> : formLoadError ? <div className="state error">{formLoadError}</div> : (
            <form onSubmit={submit}>
              <Fields fields={fields} values={createValues} setValues={setCreateValues} />
              {formError && <div className="error">{formError}</div>}
              <div className="modal-actions">
                <Button secondary onClick={() => setModal(false)} disabled={createSaving}>{t.common.cancel}</Button>
                <Button type="submit" disabled={createSaving}>{createSaving ? t.common.saving : t.common.save}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {selectedRental && (
        <Modal title={t.rentals.detailsTitle} onClose={closeDetails}>
          {successMessage && mode === 'view' && <div className="success">{successMessage}</div>}
          {mode === 'view' && (
            <>
              <div className="detail-grid">
                <div><span>{t.rentals.customer}</span><strong>{selectedRental.customerName}</strong><small>{selectedRental.customerPhone}</small></div>
                <div><span>{t.rentals.bike}</span><strong>{selectedRental.bikeRegistrationNumber}</strong><small>{selectedRental.bikeMakeModel}</small></div>
                <div><span>{t.common.status}</span><strong>{selectedRental.status}</strong></div>
                <div><span>{t.rentals.startDate}</span><strong>{selectedRental.startDate}</strong></div>
                <div><span>{t.rentals.plannedEnd}</span><strong>{selectedRental.plannedEndDate || '—'}</strong></div>
                <div><span>{t.rentals.weeklyRate}</span><strong>{selectedRental.weeklyRate} {selectedRental.currency}</strong></div>
                <div><span>{t.rentals.deposit}</span><strong>{selectedRental.depositAmount} {selectedRental.depositCurrency}</strong></div>
                <div><span>{t.rentals.closedDate}</span><strong>{selectedRental.actualClosedDate || '—'}</strong></div>
              </div>
              {selectedRental.termsAndNotes && <p className="muted">{selectedRental.termsAndNotes}</p>}
              {formError && <div className="error">{formError}</div>}
              <div className="modal-actions">
                <Button secondary onClick={closeDetails}>{t.common.close}</Button>
                {selectedRental.status === 'ACTIVE' && (
                  <>
                    <Button secondary onClick={startEdit}>{t.rentals.editRental}</Button>
                    <Button secondary onClick={startPayment}>{t.rentals.recordPayment}</Button>
                    <Button danger onClick={startClose}>{t.rentals.terminateRental}</Button>
                  </>
                )}
              </div>

              <div className="parts-section">
                <div className="parts-section-header">
                  <strong>{t.rentals.weeklySchedule}</strong>
                  {selectedRental.status !== 'CANCELLED' && (
                    <Button
                      secondary
                      onClick={() => void handleGenerateNext()}
                      disabled={generatingNext || generatingUpToDate}
                    >
                      {generatingNext ? t.rentals.generating : t.rentals.generateNext}
                    </Button>
                  )}
                </div>

                {selectedRental.status !== 'CANCELLED' && (
                  <form className="report-filters" style={{ marginBottom: 12 }} onSubmit={(e) => void handleGenerateUpToDate(e)}>
                    <label>
                      {t.rentals.generateUpToDate}
                      <input
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
                      />
                    </label>
                    <Button type="submit" secondary disabled={generatingNext || generatingUpToDate}>
                      {generatingUpToDate ? t.rentals.generating : t.rentals.generateUpToDate}
                    </Button>
                  </form>
                )}

                {chargeActionSuccess && <div className="success">{chargeActionSuccess}</div>}
                {chargeActionError && <div className="error" style={{ marginBottom: 12 }}>{chargeActionError}</div>}

                {chargesLoading && <div className="muted">{t.rentals.loadingCharges}</div>}
                {!chargesLoading && chargesError && <div className="error">{chargesError}</div>}
                {!chargesLoading && !chargesError && charges.length === 0 && (
                  <div className="muted">{t.rentals.noCharges}</div>
                )}
                {!chargesLoading && !chargesError && charges.length > 0 && (
                  <div className="table-wrap">
                    <table style={{ minWidth: 520 }}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t.rentals.period}</th>
                          <th>{t.rentals.due}</th>
                          <th>{t.rentals.amount}</th>
                          <th>{t.rentals.paid}</th>
                          <th>{t.rentals.remaining}</th>
                          <th>{t.common.status}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {charges.map((c) => (
                          <tr key={c.id}>
                            <td>{c.chargeSequence}</td>
                            <td>{c.periodStartDate} → {c.periodEndDate}</td>
                            <td>{c.dueDate}</td>
                            <td>{Number(c.amount).toFixed(2)} {c.currency}</td>
                            <td>{Number(c.paidAmount).toFixed(2)} {c.currency}</td>
                            <td>{Number(c.remainingAmount).toFixed(2)} {c.currency}</td>
                            <td>{c.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="parts-section">
                <div className="parts-section-header">
                  <strong>{t.rentals.paymentHistory}</strong>
                </div>
                {rentalPaymentsLoading && <div className="muted">{t.rentals.loadingPayments}</div>}
                {!rentalPaymentsLoading && rentalPaymentsError && <div className="error">{rentalPaymentsError}</div>}
                {!rentalPaymentsLoading && !rentalPaymentsError && rentalPayments.length === 0 && (
                  <div className="muted">{t.rentals.noPayments}</div>
                )}
                {!rentalPaymentsLoading && !rentalPaymentsError && rentalPayments.length > 0 && (
                  <div className="table-wrap">
                    <table style={{ minWidth: 520 }}>
                      <thead>
                        <tr>
                          <th>{t.rentals.date}</th>
                          <th>{t.rentals.amount}</th>
                          <th>{t.rentals.method}</th>
                          <th>{t.common.status}</th>
                          <th>{t.rentals.reference}</th>
                          <th>{t.common.notes}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rentalPayments.map((p) => (
                          <tr key={p.id}>
                            <td>{p.paymentDate}</td>
                            <td>{Number(p.amount).toFixed(2)} {p.currency}</td>
                            <td>{p.paymentMethod}</td>
                            <td>{p.status}</td>
                            <td>{displayVal(p.referenceNumber)}</td>
                            <td>{displayVal(p.notes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
          {mode === 'edit' && (
            <form onSubmit={submitEdit}>
              <Fields fields={editFields} values={editValues} setValues={setEditValues} />
              {formError && <div className="error">{formError}</div>}
              <div className="modal-actions">
                <Button secondary onClick={() => setMode('view')} disabled={editSaving}>{t.common.cancel}</Button>
                <Button type="submit" disabled={editSaving}>{editSaving ? t.common.saving : t.common.saveChanges}</Button>
              </div>
            </form>
          )}
          {mode === 'payment' && (
            <form onSubmit={submitPayment}>
              <Fields fields={paymentFields} values={paymentValues} setValues={setPaymentValues} />
              {formError && <div className="error">{formError}</div>}
              <div className="modal-actions">
                <Button secondary onClick={() => setMode('view')} disabled={paymentSaving}>{t.common.cancel}</Button>
                <Button type="submit" disabled={paymentSaving}>{paymentSaving ? t.common.saving : t.rentals.recordPayment}</Button>
              </div>
            </form>
          )}
          {mode === 'close' && (
            <form onSubmit={submitClose}>
              <Fields fields={closeFields} values={closeValues} setValues={setCloseValues} />
              {formError && <div className="error">{formError}</div>}
              <div className="modal-actions">
                <Button secondary onClick={() => setMode('view')} disabled={closeSaving}>{t.common.cancel}</Button>
                <Button danger type="submit" disabled={closeSaving}>{closeSaving ? t.rentals.closing : t.rentals.confirmClose}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </Page>
  );
}
function Payments() {
  const t = useT();
  const [customerIdInput, setCustomerIdInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState('');
  const [methodInput, setMethodInput] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  const [customerIdFilter, setCustomerIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [page, setPage] = useState(0);
  const [filterError, setFilterError] = useState('');

  const queryParams = useMemo(
    () => ({
      page,
      size: 100,
      ...(customerIdFilter ? { customerId: customerIdFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(currencyFilter ? { currency: currencyFilter } : {}),
      ...(methodFilter ? { method: methodFilter } : {}),
      ...(startDateFilter ? { startDate: startDateFilter } : {}),
      ...(endDateFilter ? { endDate: endDateFilter } : {}),
    }),
    [page, customerIdFilter, statusFilter, currencyFilter, methodFilter, startDateFilter, endDateFilter],
  );

  const resource = useResource<RecordData>('/api/v1/payments', queryParams);
  const customers = useResource<RecordData>('/api/v1/customers', { page: 0, size: 100 });
  const rentals = useResource<RecordData>('/api/v1/rentals', { page: 0, size: 100 });

  const [modal, setModal] = useState(false);
  const [values, setValues] = useState<RecordData>({});
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<RecordData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [confirmingReverse, setConfirmingReverse] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [reverseError, setReverseError] = useState('');
  const [reversing, setReversing] = useState(false);

  const allCustomerFilterOptions = customers.data.map(customer => ({
    value: customer.id,
    label: `${customer.fullName} (${customer.phone})`,
  }));
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
    { key: 'customerId', label: t.payments.customer, required: true, selectOptions: customerOptions },
    { key: 'rentalId', label: t.payments.rentalOptional, selectOptions: rentalOptions },
    { key: 'paymentDate', label: t.payments.paymentDate, type: 'date', required: true },
    { key: 'amount', label: t.payments.amount, type: 'number', required: true },
    { key: 'currency', label: t.common.currency, options: currencies, required: true },
    { key: 'paymentMethod', label: t.payments.paymentMethod, options: ['CASH', 'BANK_TRANSFER'], required: true },
    { key: 'referenceNumber', label: t.payments.referenceNumber },
    { key: 'notes', label: t.common.notes },
  ];

  useEffect(() => {
    if (!values.customerId) {
      if (values.rentalId) setValues(current => ({ ...current, rentalId: '' }));
      return;
    }
    if (values.rentalId && !customerRentals.some(rental => rental.id === values.rentalId)) {
      setValues(current => ({ ...current, rentalId: '' }));
    }
  }, [values.customerId, customerRentals, values.rentalId]);

  const applyFilters = (e: FormEvent) => {
    e.preventDefault();
    setFilterError('');
    if (startDateInput && endDateInput && endDateInput < startDateInput) {
      setFilterError(t.payments.errEndBeforeStart);
      return;
    }
    setPage(0);
    setCustomerIdFilter(customerIdInput);
    setStatusFilter(statusInput);
    setCurrencyFilter(currencyInput);
    setMethodFilter(methodInput);
    setStartDateFilter(startDateInput);
    setEndDateFilter(endDateInput);
  };

  const clearFilters = () => {
    setFilterError('');
    setCustomerIdInput('');
    setStatusInput('');
    setCurrencyInput('');
    setMethodInput('');
    setStartDateInput('');
    setEndDateInput('');
    setPage(0);
    setCustomerIdFilter('');
    setStatusFilter('');
    setCurrencyFilter('');
    setMethodFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
  };

  const hasActiveFilters = Boolean(
    customerIdInput || statusInput || currencyInput || methodInput || startDateInput || endDateInput ||
    customerIdFilter || statusFilter || currencyFilter || methodFilter || startDateFilter || endDateFilter,
  );

  const openPaymentDetails = async (row: RecordData) => {
    const id = String(row.id ?? '');
    if (!id || (detailLoading && selectedPaymentId === id)) return;
    setSelectedPaymentId(id);
    setSelectedPayment(null);
    setDetailError('');
    setConfirmingReverse(false);
    setReversalReason('');
    setReverseError('');
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/api/v1/payments/${id}`);
      setSelectedPayment(data);
    } catch (err) {
      setDetailError(errorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const closePaymentDetails = () => {
    if (reversing) return;
    setSelectedPaymentId(null);
    setSelectedPayment(null);
    setDetailError('');
    setDetailLoading(false);
    setConfirmingReverse(false);
    setReversalReason('');
    setReverseError('');
  };

  const submitReverse = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPayment || reversing || selectedPayment.status !== 'CONFIRMED') return;
    setReverseError('');
    const trimmed = reversalReason.trim();
    if (trimmed.length < 5 || reversalReason.length > 500) {
      setReverseError(t.payments.errReasonLength);
      return;
    }
    const id = String(selectedPayment.id);
    setReversing(true);
    try {
      await api.post(`/api/v1/payments/${id}/reverse`, { reason: trimmed });
      setConfirmingReverse(false);
      setReversalReason('');
      setSuccessMessage(t.payments.reversedMsg);
      const [{ data }] = await Promise.all([
        api.get(`/api/v1/payments/${id}`),
        resource.refresh(),
      ]);
      setSelectedPayment(data);
    } catch (err) {
      setReverseError(errorMessage(err));
    } finally {
      setReversing(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError('');
    if (values.rentalId && !customerRentals.some(rental => rental.id === values.rentalId)) {
      setFormError(t.payments.errRentalMismatch);
      return;
    }
    const payload = normalize(values, fields);
    if (!payload.rentalId) {
      payload.rentalId = null;
      payload.allocationMode = 'AUTO_FIFO';
    }
    setSaving(true);
    try {
      await api.post('/api/v1/payments', payload);
      setModal(false);
      setValues({});
      setSuccessMessage(t.payments.recordedMsg);
      await resource.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const formLoading = customers.loading || rentals.loading;
  const formLoadError = customers.error || rentals.error;

  return <Page title={t.payments.title} subtitle={t.payments.subtitle} action={<Button onClick={() => { setFormError(''); setSuccessMessage(''); setValues({}); setModal(true); }}><Plus size={17} />{t.payments.recordButton}</Button>}>
    {successMessage && <div className="success">{successMessage}</div>}
    <form className="report-filters" onSubmit={applyFilters}>
      <label>
        {t.payments.customer}
        <select value={customerIdInput} onChange={(e) => setCustomerIdInput(e.target.value)}>
          <option value="">{t.payments.allCustomers}</option>
          {allCustomerFilterOptions.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>
      <label>
        {t.common.status}
        <select value={statusInput} onChange={(e) => setStatusInput(e.target.value)}>
          <option value="">{t.payments.allStatuses}</option>
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="REVERSED">REVERSED</option>
        </select>
      </label>
      <label>
        {t.common.currency}
        <select value={currencyInput} onChange={(e) => setCurrencyInput(e.target.value)}>
          <option value="">{t.payments.allCurrencies}</option>
          {currencies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        {t.payments.methodLabel}
        <select value={methodInput} onChange={(e) => setMethodInput(e.target.value)}>
          <option value="">{t.payments.allMethods}</option>
          <option value="CASH">CASH</option>
          <option value="BANK_TRANSFER">BANK_TRANSFER</option>
        </select>
      </label>
      <label>
        {t.payments.startDate}
        <input type="date" value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)} />
      </label>
      <label>
        {t.payments.endDate}
        <input type="date" value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)} />
      </label>
      <Button type="submit">{t.payments.applyFilters}</Button>
      {hasActiveFilters && <Button secondary onClick={clearFilters}>{t.payments.clearFilters}</Button>}
    </form>
    {filterError && <div className="error" style={{ marginBottom: 14 }}>{filterError}</div>}
    <State loading={resource.loading} error={resource.error} empty={!resource.data.length}><Table columns={['customerName', 'paymentDate', 'amount', 'currency', 'paymentMethod', 'status']} rows={resource.data} onRow={(row) => void openPaymentDetails(row)} /></State>
    <PaginationControls page={page} pageInfo={resource.pageInfo} loading={resource.loading} onPageChange={setPage} />
    {modal && <Modal title={t.payments.recordButton} onClose={() => !saving && setModal(false)}>
      {formLoading ? <div className="state">{t.payments.loadingRefs}</div> : formLoadError ? <div className="state error">{formLoadError}</div> : <form onSubmit={submit}>
        <Fields fields={fields} values={values} setValues={setValues} />
        {values.customerId && rentalOptions.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>{t.payments.customerLevelHint}</p>
        )}
        {formError && <div className="error" style={{ marginTop: 10 }}>{formError}</div>}
        <div className="modal-actions"><Button secondary onClick={() => setModal(false)} disabled={saving}>{t.common.cancel}</Button><Button type="submit" disabled={saving}>{saving ? t.common.saving : t.common.save}</Button></div>
      </form>}
    </Modal>}
    {selectedPaymentId && (
      <Modal title={t.payments.detailsTitle} onClose={closePaymentDetails}>
        {detailLoading && <div className="state">{t.payments.loadingDetails}</div>}
        {!detailLoading && detailError && <div className="error">{detailError}</div>}
        {!detailLoading && !detailError && !selectedPayment && (
          <div className="state">{t.payments.notFound}</div>
        )}
        {!detailLoading && !detailError && selectedPayment && (
          <>
            <div className="detail-grid">
              <div><span>{t.payments.customer}</span><strong>{displayVal(selectedPayment.customerName)}</strong></div>
              <div><span>{t.payments.rental}</span><strong>{selectedPayment.rentalId ? displayVal(selectedPayment.rentalId) : t.payments.customerLevelUnlinked}</strong></div>
              <div><span>{t.payments.paymentDate}</span><strong>{displayVal(selectedPayment.paymentDate)}</strong></div>
              <div><span>{t.payments.amount}</span><strong>{Number(selectedPayment.amount ?? 0).toFixed(2)} {displayVal(selectedPayment.currency)}</strong></div>
              <div><span>{t.common.currency}</span><strong>{displayVal(selectedPayment.currency)}</strong></div>
              <div><span>{t.payments.paymentMethod}</span><strong>{displayVal(selectedPayment.paymentMethod)}</strong></div>
              <div><span>{t.common.status}</span><strong>{displayVal(selectedPayment.status)}</strong></div>
              <div><span>{t.payments.recordedBy}</span><strong>{displayVal(selectedPayment.recordedByUserName)}</strong></div>
              <div><span>{t.payments.referenceNumber}</span><strong>{displayVal(selectedPayment.referenceNumber)}</strong></div>
              <div><span>{t.common.notes}</span><strong>{displayVal(selectedPayment.notes)}</strong></div>
              <div><span>{t.common.createdAt}</span><strong>{selectedPayment.createdAt ? String(selectedPayment.createdAt).slice(0, 19).replace('T', ' ') : '—'}</strong></div>
              {(selectedPayment.status === 'REVERSED' || selectedPayment.reversalReason || selectedPayment.reversedAt) && (
                <>
                  <div><span>{t.payments.reversalReason}</span><strong>{displayVal(selectedPayment.reversalReason)}</strong></div>
                  <div><span>{t.payments.reversedAt}</span><strong>{selectedPayment.reversedAt ? String(selectedPayment.reversedAt).slice(0, 19).replace('T', ' ') : '—'}</strong></div>
                </>
              )}
            </div>

            <div className="parts-section">
              <div className="parts-section-header">
                <strong>{t.payments.allocations}</strong>
              </div>
              {!Array.isArray(selectedPayment.allocations) || selectedPayment.allocations.length === 0 ? (
                <div className="muted">{t.payments.noAllocations}</div>
              ) : (
                <div className="table-wrap">
                  <table style={{ minWidth: 500 }}>
                    <thead>
                      <tr>
                        <th>{t.payments.chargeSeq}</th>
                        <th>{t.payments.dueDate}</th>
                        <th>{t.payments.allocatedAmount}</th>
                        <th>{t.common.currency}</th>
                        <th>{t.payments.allocatedAt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPayment.allocations.map((alloc: RecordData) => (
                        <tr key={alloc.id}>
                          <td>#{displayVal(alloc.chargeSequence)}</td>
                          <td>{displayVal(alloc.chargeDueDate)}</td>
                          <td>{Number(alloc.allocatedAmount ?? 0).toFixed(2)}</td>
                          <td>{displayVal(alloc.currency)}</td>
                          <td>{alloc.allocatedAt ? String(alloc.allocatedAt).slice(0, 19).replace('T', ' ') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedPayment.status === 'CONFIRMED' && confirmingReverse && (
              <form className="parts-section" onSubmit={submitReverse}>
                <p style={{ marginTop: 0 }}>
                  {t.payments.reverseConfirmPrompt}
                </p>
                <div className="form-grid">
                  <label className="full-span">
                    {t.payments.reasonLabel}
                    <textarea
                      rows={3}
                      required
                      minLength={5}
                      maxLength={500}
                      disabled={reversing}
                      value={reversalReason}
                      onChange={(e) => setReversalReason(e.target.value)}
                      placeholder={t.payments.reasonPlaceholder}
                    />
                  </label>
                </div>
                {reverseError && <div className="error" style={{ marginTop: 10 }}>{reverseError}</div>}
                <div className="modal-actions">
                  <Button secondary onClick={() => { setConfirmingReverse(false); setReverseError(''); }} disabled={reversing}>{t.common.cancel}</Button>
                  <Button danger type="submit" disabled={reversing}>
                    {reversing ? t.payments.reversing : t.payments.confirmReverse}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
        <div className="modal-actions">
          {selectedPayment?.status === 'CONFIRMED' && !confirmingReverse && (
            <Button
              danger
              disabled={detailLoading || reversing}
              onClick={() => {
                setReverseError('');
                setReversalReason('');
                setConfirmingReverse(true);
              }}
            >
              {t.payments.reverseButton}
            </Button>
          )}
          <Button secondary onClick={closePaymentDetails} disabled={reversing}>{t.common.close}</Button>
        </div>
      </Modal>
    )}
  </Page>;
}
function Servicing() {
  const t = useT();
  const [bikeIdInput, setBikeIdInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [bikeIdFilter, setBikeIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [page, setPage] = useState(0);
  const [filterError, setFilterError] = useState('');

  const [viewMode, setViewMode] = useState<'all' | 'scheduled' | 'due'>('all');
  const [scheduledDate, setScheduledDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [scheduledServices, setScheduledServices] = useState<RecordData[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState('');
  const [scheduledLoaded, setScheduledLoaded] = useState(false);

  const [asOfDate, setAsOfDate] = useState('');
  const [dueServices, setDueServices] = useState<RecordData[]>([]);
  const [dueLoading, setDueLoading] = useState(false);
  const [dueError, setDueError] = useState('');
  const [dueLoaded, setDueLoaded] = useState(false);

  const [completeTarget, setCompleteTarget] = useState<RecordData | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const queryParams = useMemo(
    () => ({
      page,
      size: 100,
      sort: 'serviceDate,DESC',
      ...(bikeIdFilter ? { bikeId: bikeIdFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(startDateFilter ? { startDate: startDateFilter } : {}),
      ...(endDateFilter ? { endDate: endDateFilter } : {}),
    }),
    [page, bikeIdFilter, statusFilter, startDateFilter, endDateFilter],
  );

  const resource = useResource<RecordData>('/api/v1/services', queryParams);
  const bikes = useResource<RecordData>('/api/v1/bikes', { page: 0, size: 100 });
  const parts = useResource<RecordData>('/api/v1/parts', { page: 0, size: 100 });
  const [modal, setModal] = useState(false);
  const [values, setValues] = useState<RecordData>({});
  const [partRows, setPartRows] = useState<{ partId: string; quantity: string }[]>([]);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<RecordData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const openServiceDetails = async (row: RecordData) => {
    const id = String(row.id ?? '');
    if (!id || (detailLoading && selectedServiceId === id)) return;
    setSelectedServiceId(id);
    setSelectedService(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/api/v1/services/${id}`);
      setSelectedService(data);
    } catch (err) {
      setDetailError(errorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeServiceDetails = () => {
    setSelectedServiceId(null);
    setSelectedService(null);
    setDetailError('');
    setDetailLoading(false);
  };
  const fields: FormField[] = [
    { key: 'motorbikeId', label: t.servicing.bike, required: true, selectOptions: bikes.data.filter(bike => !bike.archived).map(bike => ({ value: bike.id, label: `${bike.registrationNumber} — ${bike.make} ${bike.model}` })) },
    { key: 'serviceDate', label: t.servicing.serviceDate, type: 'date', required: true },
    { key: 'odometerReading', label: t.servicing.odometerReading, type: 'number', required: true },
    { key: 'serviceProvider', label: t.servicing.serviceProvider, required: true },
    { key: 'workPerformed', label: t.servicing.workPerformed, required: true },
    { key: 'labourCost', label: t.servicing.labourCost, type: 'number', required: true },
    { key: 'labourCurrency', label: t.common.currency, options: currencies, required: true },
    { key: 'status', label: t.common.status, options: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
    { key: 'nextServiceDueDate', label: t.servicing.nextServiceDueDate, type: 'date' },
    { key: 'nextServiceDueOdometer', label: t.servicing.nextServiceDueOdometer, type: 'number' },
    { key: 'notes', label: t.common.notes, type: 'textarea' },
  ];
  const addPartRow = () => setPartRows(rows => [...rows, { partId: '', quantity: '' }]);
  const updatePartRow = (index: number, key: 'partId' | 'quantity', value: string) => {
    setPartRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };
  const removePartRow = (index: number) => setPartRows(rows => rows.filter((_, rowIndex) => rowIndex !== index));
  const openLogServiceModal = () => {
    setValues({ status: 'COMPLETED', labourCurrency: 'RON' });
    setPartRows([]);
    setFormError('');
    setSuccessMessage('');
    setModal(true);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError('');

    const odometer = Number(values.odometerReading);
    if (!Number.isFinite(odometer) || odometer < 0) {
      setFormError(t.servicing.errOdometer);
      return;
    }
    const labourCost = Number(values.labourCost);
    if (!Number.isFinite(labourCost) || labourCost < 0) {
      setFormError(t.servicing.errLabourCost);
      return;
    }
    if (values.nextServiceDueOdometer !== undefined && String(values.nextServiceDueOdometer).trim() !== '') {
      const nextOdo = Number(values.nextServiceDueOdometer);
      if (!Number.isFinite(nextOdo) || nextOdo < 0) {
        setFormError(t.servicing.errNextOdo);
        return;
      }
    }
    if (partRows.some(row => !row.partId || !row.quantity || Number(row.quantity) < 0.01)) {
      setFormError(t.servicing.errPartRows);
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
    const payload = normalize(values, fields);
    if (typeof payload.notes === 'string' && payload.notes.trim() === '') {
      delete payload.notes;
    }
    setSaving(true);
    try {
      await api.post('/api/v1/services', { ...payload, partsUsed });
      setModal(false);
      setValues({});
      setPartRows([]);
      setSuccessMessage(t.servicing.loggedMsg);
      await resource.refresh();
      await parts.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const submitFilters = (e: FormEvent) => {
    e.preventDefault();
    setFilterError('');
    if (startDateInput && endDateInput && endDateInput < startDateInput) {
      setFilterError(t.servicing.errEndBeforeStart);
      return;
    }
    setPage(0);
    setBikeIdFilter(bikeIdInput);
    setStatusFilter(statusInput);
    setStartDateFilter(startDateInput);
    setEndDateFilter(endDateInput);
  };

  const clearFilters = () => {
    setFilterError('');
    setBikeIdInput('');
    setStatusInput('');
    setStartDateInput('');
    setEndDateInput('');
    setPage(0);
    setBikeIdFilter('');
    setStatusFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
  };

  const activeBikeFilterOptions = bikes.data
    .filter(bike => !bike.archived)
    .map(bike => ({ value: bike.id, label: `${bike.registrationNumber} — ${bike.make} ${bike.model}` }));
  const hasActiveFilters = Boolean(
    bikeIdInput || statusInput || startDateInput || endDateInput ||
    bikeIdFilter || statusFilter || startDateFilter || endDateFilter,
  );

  const loadDueServices = async (dateOverride?: string) => {
    if (dueLoading) return;
    const effectiveDate = dateOverride !== undefined ? dateOverride : asOfDate;
    setDueLoading(true);
    setDueError('');
    try {
      const { data } = await api.get('/api/v1/services/due', {
        params: effectiveDate ? { asOfDate: effectiveDate } : undefined,
      });
      setDueServices(Array.isArray(data) ? data : []);
      setDueLoaded(true);
    } catch (err) {
      setDueServices([]);
      setDueError(errorMessage(err));
    } finally {
      setDueLoading(false);
    }
  };

  const switchToDueView = () => {
    setViewMode('due');
    if (!dueLoaded && !dueLoading) {
      void loadDueServices();
    }
  };

  const fetchAllServicesByStatus = async (status: 'PLANNED' | 'IN_PROGRESS'): Promise<RecordData[]> => {
    const collected: RecordData[] = [];
    let currentPage = 0;
    let totalPages = 1;
    do {
      const { data } = await api.get('/api/v1/services', {
        params: {
          status,
          page: currentPage,
          size: 100,
          sort: 'serviceDate,ASC',
        },
      });
      const content = Array.isArray(data?.content) ? data.content : Array.isArray(data) ? data : [];
      collected.push(...content);
      totalPages = typeof data?.totalPages === 'number' ? data.totalPages : 1;
      currentPage += 1;
    } while (currentPage < totalPages);
    return collected;
  };

  const loadScheduledServices = async () => {
    if (scheduledLoading) return;
    setScheduledLoading(true);
    setScheduledError('');
    try {
      const [planned, inProgress] = await Promise.all([
        fetchAllServicesByStatus('PLANNED'),
        fetchAllServicesByStatus('IN_PROGRESS'),
      ]);
      const combined = [...planned, ...inProgress].filter(
        (item) => item.status === 'PLANNED' || item.status === 'IN_PROGRESS',
      );
      combined.sort((a, b) => String(a.serviceDate ?? '').localeCompare(String(b.serviceDate ?? '')));
      setScheduledServices(combined);
      setScheduledLoaded(true);
    } catch (err) {
      setScheduledServices([]);
      setScheduledError(errorMessage(err));
    } finally {
      setScheduledLoading(false);
    }
  };

  const switchToScheduledView = () => {
    setViewMode('scheduled');
    if (!scheduledLoaded && !scheduledLoading) {
      void loadScheduledServices();
    }
  };

  const getScheduleClassification = (serviceDate: unknown, referenceDate: string) => {
    const dateStr = String(serviceDate ?? '');
    if (!dateStr || !referenceDate) return t.servicing.upcoming;
    if (dateStr < referenceDate) return t.servicing.overdue;
    if (dateStr === referenceDate) return t.servicing.dueToday;
    return t.servicing.upcoming;
  };

  const openCompleteConfirm = (row: RecordData) => {
    if (completing) return;
    setCompleteTarget(row);
    setCompleteError('');
    setSuccessMessage('');
  };

  const closeCompleteConfirm = () => {
    if (completing) return;
    setCompleteTarget(null);
    setCompleteError('');
  };

  const confirmMarkCompleted = async () => {
    if (!completeTarget || completing) return;
    const id = String(completeTarget.id ?? '');
    if (!id) return;
    setCompleting(true);
    setCompleteError('');
    try {
      await api.patch(`/api/v1/services/${id}/status`, { status: 'COMPLETED' });
      setCompleteTarget(null);
      setSuccessMessage(t.servicing.completedMsg);
      const refreshTasks: Promise<unknown>[] = [resource.refresh()];
      if (viewMode === 'scheduled' || scheduledLoaded) {
        refreshTasks.push(loadScheduledServices());
      }
      if (selectedServiceId === id) {
        refreshTasks.push(
          api.get(`/api/v1/services/${id}`).then(({ data }) => {
            setSelectedService(data);
          }),
        );
      }
      await Promise.all(refreshTasks);
    } catch (err) {
      setCompleteError(errorMessage(err));
    } finally {
      setCompleting(false);
    }
  };

  const formLoading = bikes.loading || parts.loading;
  const formLoadError = bikes.error || parts.error;
  return <Page
    title={t.servicing.title}
    subtitle={t.servicing.subtitle}
    action={
      <div className="page-actions">
        <Button secondary={viewMode !== 'all'} onClick={() => setViewMode('all')}>{t.servicing.allServices}</Button>
        <Button secondary={viewMode !== 'scheduled'} onClick={switchToScheduledView}>{t.servicing.scheduledOverdue}</Button>
        <Button secondary={viewMode !== 'due'} onClick={switchToDueView}>{t.servicing.dueServices}</Button>
        <Button onClick={openLogServiceModal}><Plus size={17} />{t.servicing.logService}</Button>
      </div>
    }
  >
    {successMessage && <div className="success">{successMessage}</div>}
    {viewMode === 'all' ? (
      <>
        <form className="report-filters" onSubmit={submitFilters}>
          <label>
            {t.servicing.bike}
            <select value={bikeIdInput} onChange={(e) => setBikeIdInput(e.target.value)}>
              <option value="">{t.servicing.allBikes}</option>
              {activeBikeFilterOptions.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </label>
          <label>
            {t.common.status}
            <select value={statusInput} onChange={(e) => setStatusInput(e.target.value)}>
              <option value="">{t.servicing.allStatuses}</option>
              <option value="PLANNED">PLANNED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </label>
          <label>
            {t.servicing.startDate}
            <input type="date" value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)} />
          </label>
          <label>
            {t.servicing.endDate}
            <input type="date" value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)} />
          </label>
          <Button type="submit">{t.common.search}</Button>
          {hasActiveFilters && <Button secondary onClick={clearFilters}>{t.common.clear}</Button>}
        </form>
        {filterError && <div className="error" style={{ marginBottom: 14 }}>{filterError}</div>}
        <State loading={resource.loading} error={resource.error} empty={!resource.data.length}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.columns.motorbikeRegistrationNumber}</th>
                  <th>{t.columns.serviceDate}</th>
                  <th>{t.columns.serviceProvider}</th>
                  <th>{t.columns.workPerformed}</th>
                  <th>{t.columns.labourCost}</th>
                  <th>{t.common.status}</th>
                  <th>{t.common.action}</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((row, index) => (
                  <tr key={row.id || index} onClick={() => void openServiceDetails(row)}>
                    <td>{displayVal(row.motorbikeRegistrationNumber)}</td>
                    <td>{displayVal(row.serviceDate)}</td>
                    <td>{displayVal(row.serviceProvider)}</td>
                    <td>{displayVal(row.workPerformed)}</td>
                    <td>{displayVal(row.labourCost)}</td>
                    <td>{displayVal(row.status)}</td>
                    <td>
                      {(row.status === 'PLANNED' || row.status === 'IN_PROGRESS') ? (
                        <button
                          type="button"
                          className="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCompleteConfirm(row);
                          }}
                        >
                          {t.servicing.markCompleted}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
        <PaginationControls page={page} pageInfo={resource.pageInfo} loading={resource.loading} onPageChange={setPage} />
      </>
    ) : viewMode === 'scheduled' ? (
      <>
        <form
          className="report-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void loadScheduledServices();
          }}
        >
          <label>
            {t.servicing.referenceDate}
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={scheduledLoading}>
            {scheduledLoading ? t.servicing.refreshing : t.servicing.refresh}
          </Button>
        </form>
        {!scheduledLoading && !scheduledError && scheduledLoaded && (
          <p className="muted" style={{ marginBottom: 12 }}>
            {t.servicing.scheduledCount}: <strong>{scheduledServices.length}</strong>
          </p>
        )}
        <State
          loading={scheduledLoading}
          error={scheduledError}
          empty={scheduledLoaded && scheduledServices.length === 0}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.servicing.bike}</th>
                  <th>{t.servicing.makeModel}</th>
                  <th>{t.servicing.serviceDate}</th>
                  <th>{t.servicing.schedule}</th>
                  <th>{t.servicing.serviceProvider}</th>
                  <th>{t.servicing.workPerformed}</th>
                  <th>{t.common.status}</th>
                  <th>{t.common.action}</th>
                </tr>
              </thead>
              <tbody>
                {scheduledServices.map((row, index) => {
                  const scheduleLabel = getScheduleClassification(row.serviceDate, scheduledDate);
                  return (
                    <tr key={row.id || index} onClick={() => void openServiceDetails(row)}>
                      <td>{displayVal(row.bikeRegistrationNumber ?? row.motorbikeRegistrationNumber)}</td>
                      <td>{displayVal(row.bikeMakeModel)}</td>
                      <td>{displayVal(row.serviceDate)}</td>
                      <td>{scheduleLabel}</td>
                      <td>{displayVal(row.serviceProvider)}</td>
                      <td>{displayVal(row.workPerformed)}</td>
                      <td>{displayVal(row.status)}</td>
                      <td>
                        {(row.status === 'PLANNED' || row.status === 'IN_PROGRESS') ? (
                          <button
                            type="button"
                            className="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCompleteConfirm(row);
                            }}
                          >
                            {t.servicing.markCompleted}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </State>
      </>
    ) : (
      <>
        <form
          className="report-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void loadDueServices();
          }}
        >
          <label>
            {t.servicing.asOfDateOptional}
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </label>
          <Button type="submit" disabled={dueLoading}>{dueLoading ? t.servicing.checking : t.servicing.checkDue}</Button>
          {asOfDate && (
            <Button
              secondary
              disabled={dueLoading}
              onClick={() => {
                setAsOfDate('');
                void loadDueServices('');
              }}
            >
              {t.servicing.resetToday}
            </Button>
          )}
        </form>
        <p className="muted" style={{ marginBottom: 14 }}>
          {t.servicing.dueNote}
        </p>
        {!dueLoading && !dueError && dueLoaded && (
          <p className="muted" style={{ marginBottom: 12 }}>
            {t.servicing.dueCount}: <strong>{dueServices.length}</strong>
          </p>
        )}
        <State loading={dueLoading} error={dueError} empty={dueLoaded && dueServices.length === 0}>
          <Table
            columns={[
              'bikeRegistrationNumber',
              'bikeMakeModel',
              'serviceDate',
              'odometerReading',
              'nextServiceDueDate',
              'nextServiceDueOdometer',
              'status',
            ]}
            rows={dueServices}
            onRow={(row) => void openServiceDetails(row)}
          />
        </State>
      </>
    )}
    {modal && <Modal title={t.servicing.logService} onClose={() => !saving && setModal(false)}>
      {formLoading ? <div className="state">{t.servicing.loadingRefs}</div> : formLoadError ? <div className="state error">{formLoadError}</div> : <form onSubmit={submit}>
        <Fields fields={fields} values={values} setValues={setValues} />
        <div className="parts-section">
          <div className="parts-section-header"><strong>{t.servicing.partsUsed}</strong><Button secondary onClick={addPartRow}><Plus size={15} />{t.servicing.addItem}</Button></div>
          {partRows.length === 0 && <p className="muted">{t.servicing.noPartsSelected}</p>}
          {partRows.map((row, index) => <div className="part-row" key={index}>
            <select required value={row.partId} onChange={e => updatePartRow(index, 'partId', e.target.value)}>
              <option value="">{t.servicing.selectStockItem}</option>
              {parts.data.filter(part => part.active).map(part => <option key={part.id} value={part.id}>{part.partCode} — {part.name} ({t.servicing.stockLabel}: {part.currentQuantity})</option>)}
            </select>
            <input required type="number" min="0.01" step="0.01" placeholder={t.servicing.quantity} value={row.quantity} onChange={e => updatePartRow(index, 'quantity', e.target.value)} />
            <button type="button" className="icon" aria-label={t.servicing.removeItem} onClick={() => removePartRow(index)}><X size={17} /></button>
          </div>)}
        </div>
        {formError && <div className="error">{formError}</div>}
        <div className="modal-actions"><Button secondary onClick={() => setModal(false)} disabled={saving}>{t.common.cancel}</Button><Button type="submit" disabled={saving}>{saving ? t.common.saving : t.common.save}</Button></div>
      </form>}
    </Modal>}
    {selectedServiceId && (
      <Modal title={t.servicing.detailsTitle} onClose={closeServiceDetails}>
        {detailLoading && <div className="state">{t.servicing.loadingDetails}</div>}
        {!detailLoading && detailError && <div className="error">{detailError}</div>}
        {!detailLoading && !detailError && !selectedService && (
          <div className="state">{t.servicing.notFound}</div>
        )}
        {!detailLoading && !detailError && selectedService && (
          <>
            <div className="detail-grid">
              <div><span>{t.servicing.bikeRegistration}</span><strong>{displayVal(selectedService.bikeRegistrationNumber ?? selectedService.motorbikeRegistrationNumber)}</strong></div>
              <div><span>{t.servicing.bikeMakeModel}</span><strong>{displayVal(selectedService.bikeMakeModel)}</strong></div>
              <div><span>{t.servicing.serviceDate}</span><strong>{displayVal(selectedService.serviceDate)}</strong></div>
              <div><span>{t.servicing.odometerReading}</span><strong>{displayVal(selectedService.odometerReading)}</strong></div>
              <div><span>{t.servicing.serviceProvider}</span><strong>{displayVal(selectedService.serviceProvider)}</strong></div>
              <div><span>{t.servicing.workPerformed}</span><strong>{displayVal(selectedService.workPerformed)}</strong></div>
              <div><span>{t.servicing.labourCost}</span><strong>{Number(selectedService.labourCost ?? 0).toFixed(2)} {displayVal(selectedService.labourCurrency)}</strong></div>
              <div><span>{t.servicing.partsCost}</span><strong>{Number(selectedService.partsCost ?? 0).toFixed(2)} {displayVal(selectedService.labourCurrency)}</strong></div>
              <div><span>{t.servicing.totalCost}</span><strong>{Number(selectedService.totalCost ?? 0).toFixed(2)} {displayVal(selectedService.labourCurrency)}</strong></div>
              <div><span>{t.common.status}</span><strong>{displayVal(selectedService.status)}</strong></div>
              <div><span>{t.servicing.completedAt}</span><strong>{selectedService.completedAt ? String(selectedService.completedAt).slice(0, 19).replace('T', ' ') : t.common.notRecorded}</strong></div>
              <div><span>{t.servicing.nextServiceDueDate}</span><strong>{displayVal(selectedService.nextServiceDueDate)}</strong></div>
              <div><span>{t.servicing.nextServiceDueOdometer}</span><strong>{displayVal(selectedService.nextServiceDueOdometer)}</strong></div>
              <div><span>{t.common.notes}</span><strong>{displayVal(selectedService.notes)}</strong></div>
            </div>

            <div className="parts-section">
              <div className="parts-section-header">
                <strong>{t.servicing.partsUsed}</strong>
              </div>
              {!Array.isArray(selectedService.partsUsed) || selectedService.partsUsed.length === 0 ? (
                <div className="muted">{t.servicing.noPartsUsed}</div>
              ) : (
                <div className="table-wrap">
                  <table style={{ minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>{t.servicing.partCode}</th>
                        <th>{t.servicing.partName}</th>
                        <th>{t.servicing.quantity}</th>
                        <th>{t.servicing.unitCost}</th>
                        <th>{t.common.currency}</th>
                        <th>{t.servicing.totalCost}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedService.partsUsed.map((p: RecordData) => (
                        <tr key={p.id}>
                          <td>{displayVal(p.partCode)}</td>
                          <td>{displayVal(p.partName)}</td>
                          <td>{displayVal(p.quantity)}</td>
                          <td>{Number(p.unitCost ?? 0).toFixed(2)}</td>
                          <td>{displayVal(p.currency)}</td>
                          <td>{Number(p.totalCost ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
        <div className="modal-actions">
          <Button secondary onClick={closeServiceDetails}>{t.common.close}</Button>
        </div>
      </Modal>
    )}
    {completeTarget && (
      <Modal title={t.servicing.confirmCompleteTitle} onClose={closeCompleteConfirm}>
        <p style={{ marginTop: 0 }}>
          {t.servicing.confirmCompletePromptPrefix} <strong>COMPLETED</strong>?{' '}
          {t.servicing.confirmCompletePromptMid} <strong>{displayVal(completeTarget.status)}</strong> → <strong>COMPLETED</strong> {t.servicing.confirmCompletePromptEnd}
        </p>
        <div className="detail-grid">
          <div><span>{t.servicing.bikeRegistration}</span><strong>{displayVal(completeTarget.bikeRegistrationNumber ?? completeTarget.motorbikeRegistrationNumber)}</strong></div>
          <div><span>{t.servicing.serviceDate}</span><strong>{displayVal(completeTarget.serviceDate)}</strong></div>
          <div><span>{t.servicing.serviceProvider}</span><strong>{displayVal(completeTarget.serviceProvider)}</strong></div>
          <div><span>{t.servicing.workPerformed}</span><strong>{displayVal(completeTarget.workPerformed)}</strong></div>
        </div>
        {completeError && <div className="error" style={{ marginBottom: 14 }}>{completeError}</div>}
        <div className="modal-actions">
          <Button secondary onClick={closeCompleteConfirm} disabled={completing}>{t.common.cancel}</Button>
          <Button onClick={() => void confirmMarkCompleted()} disabled={completing}>
            {completing ? t.servicing.completing : t.servicing.confirmCompleteBtn}
          </Button>
        </div>
      </Modal>
    )}
  </Page>;
}
function StockMovementAction({
  mode,
  preselectedPart,
  onSuccess,
}: {
  mode: 'STOCK_IN' | 'STOCK_OUT';
  preselectedPart?: RecordData | null;
  onSuccess?: (partId: string) => Promise<void> | void;
}) {
  const t = useT();
  const isStockIn = mode === 'STOCK_IN';
  const parts = useResource<RecordData>('/api/v1/parts', { page: 0, size: 100 });
  const [modal, setModal] = useState(false);
  const [values, setValues] = useState<RecordData>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const partOptions = parts.data
    .filter(part => part.active)
    .map(part => ({ value: part.id, label: `${part.partCode} — ${part.name} (${t.servicing.stockLabel}: ${part.currentQuantity})` }));

  const fields: FormField[] = isStockIn
    ? [
        { key: 'partId', label: t.inventory.inventoryItem, required: true, selectOptions: partOptions },
        { key: 'quantity', label: t.inventory.quantityToAdd, type: 'number', required: true },
        { key: 'unitCost', label: t.inventory.unitCost, type: 'number' },
        { key: 'currency', label: t.common.currency, options: currencies, required: true },
        { key: 'reason', label: t.inventory.reason },
      ]
    : [
        { key: 'partId', label: t.inventory.inventoryItem, required: true, selectOptions: partOptions },
        { key: 'quantity', label: t.inventory.quantityToRemove, type: 'number', required: true },
        { key: 'reason', label: t.inventory.reason, required: true },
      ];

  const openModal = () => {
    setValues({
      ...(preselectedPart?.id ? { partId: preselectedPart.id } : {}),
      ...(isStockIn ? { currency: preselectedPart?.costCurrency || 'RON' } : {}),
    });
    setError('');
    setModal(true);
    void parts.refresh();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');

    const qty = Number(values.quantity);
    if (!Number.isFinite(qty) || qty < 0.01) {
      setError(t.inventory.errQty);
      return;
    }
    if (isStockIn && values.unitCost !== undefined && values.unitCost !== '') {
      const cost = Number(values.unitCost);
      if (!Number.isFinite(cost) || cost < 0) {
        setError(t.inventory.errUnitCost);
        return;
      }
    }
    if (!isStockIn && String(values.reason ?? '').trim().length === 0) {
      setError(t.inventory.errReasonOut);
      return;
    }

    setSaving(true);
    try {
      const normalized = normalize(values, fields);
      const selectedPartObj = parts.data.find(item => item.id === normalized.partId) ?? preselectedPart;
      await api.post('/api/v1/stock-movements', {
        ...normalized,
        movementType: mode,
        referenceType: isStockIn ? 'MANUAL_STOCK_IN' : 'MANUAL_STOCK_OUT',
        ...(!isStockIn && selectedPartObj?.costCurrency ? { currency: selectedPartObj.costCurrency } : {}),
      });
      setModal(false);
      setValues({});
      await Promise.all([
        parts.refresh(),
        Promise.resolve(onSuccess?.(String(normalized.partId))),
      ]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    if (saving) return;
    setModal(false);
    setValues({});
  };

  const buttonLabel = isStockIn ? t.inventory.addStock : t.inventory.stockOut;
  const modalTitle = isStockIn ? t.inventory.addStock : t.inventory.stockOut;
  const submitLabel = isStockIn ? t.inventory.addQuantity : t.inventory.removeQuantity;

  return (
    <>
      <Button secondary onClick={openModal}><Plus size={17} />{buttonLabel}</Button>
      {modal && (
        <Modal title={modalTitle} onClose={closeModal}>
          {parts.loading ? <div className="state">{t.inventory.loadingInventory}</div> : parts.error ? <div className="state error">{parts.error}</div> : (
            <form onSubmit={submit}>
              <Fields fields={fields} values={values} setValues={setValues} />
              {error && <div className="error">{error}</div>}
              <div className="modal-actions">
                <Button secondary onClick={closeModal} disabled={saving}>{t.common.cancel}</Button>
                <Button type="submit" disabled={saving}>{saving ? t.common.saving : submitLabel}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

function Inventory() {
  const t = useT();
  const [searchInput, setSearchInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(0);

  const queryParams = useMemo(
    () => ({
      page,
      size: 100,
      ...(search ? { search } : {}),
      ...(category ? { category } : {}),
      ...(lowStockOnly ? { lowStockOnly: true } : {}),
      ...(includeArchived ? { includeArchived: true } : {}),
    }),
    [page, search, category, lowStockOnly, includeArchived],
  );
  const resource = useResource<RecordData>('/api/v1/parts', queryParams);

  const [createModal, setCreateModal] = useState(false);
  const [createValues, setCreateValues] = useState<RecordData>({});
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  const [selectedPart, setSelectedPart] = useState<RecordData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<RecordData>({});
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [movements, setMovements] = useState<RecordData[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState('');

  const loadMovements = async (partId: string) => {
    setMovementsLoading(true);
    setMovementsError('');
    try {
      const { data } = await api.get(`/api/v1/stock-movements/part/${partId}`);
      setMovements(Array.isArray(data) ? data : []);
    } catch (err) {
      setMovements([]);
      setMovementsError(errorMessage(err));
    } finally {
      setMovementsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPart?.id) {
      setMovements([]);
      setMovementsError('');
      return;
    }
    void loadMovements(String(selectedPart.id));
  }, [selectedPart?.id]);

  const handleStockMovementSuccess = async (partId: string, label: string) => {
    setSuccessMessage(label);
    await resource.refresh();
    if (selectedPart?.id === partId) {
      const { data } = await api.get(`/api/v1/parts/${partId}`);
      setSelectedPart(data);
      await loadMovements(partId);
    }
  };

  const createFields: FormField[] = [
    { key: 'partCode', label: t.inventory.partCode, required: true },
    { key: 'name', label: t.inventory.partName, required: true },
    { key: 'category', label: t.inventory.category, required: true },
    { key: 'description', label: t.inventory.description },
    { key: 'unitOfMeasure', label: t.inventory.unit, required: true },
    { key: 'initialQuantity', label: t.inventory.initialQuantity, type: 'number', required: true },
    { key: 'minReorderLevel', label: t.inventory.minReorderLevel, type: 'number', required: true },
    { key: 'defaultUnitCost', label: t.inventory.defaultUnitCost, type: 'number', required: true },
    { key: 'costCurrency', label: t.common.currency, options: currencies, required: true },
  ];

  const editFields: FormField[] = [
    { key: 'name', label: t.inventory.partName, required: true },
    { key: 'category', label: t.inventory.category, required: true },
    { key: 'description', label: t.inventory.description },
    { key: 'unitOfMeasure', label: t.inventory.unit, required: true },
    { key: 'minReorderLevel', label: t.inventory.minReorderLevel, type: 'number', required: true },
    { key: 'defaultUnitCost', label: t.inventory.defaultUnitCost, type: 'number', required: true },
  ];

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
    setCategory(categoryInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setCategoryInput('');
    setLowStockOnly(false);
    setIncludeArchived(false);
    setPage(0);
    setSearch('');
    setCategory('');
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (createSaving) return;
    setCreateError('');
    setCreateSaving(true);
    try {
      await api.post('/api/v1/parts', normalize(createValues, createFields));
      setCreateModal(false);
      setCreateValues({});
      setSuccessMessage(t.inventory.createdMsg);
      await resource.refresh();
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreateSaving(false);
    }
  };

  const openEdit = () => {
    if (!selectedPart) return;
    setEditError('');
    setSuccessMessage('');
    setConfirmArchive(false);
    setEditValues({
      name: selectedPart.name ?? '',
      category: selectedPart.category ?? '',
      description: selectedPart.description ?? '',
      unitOfMeasure: selectedPart.unitOfMeasure ?? '',
      minReorderLevel: String(selectedPart.minReorderLevel ?? ''),
      defaultUnitCost: String(selectedPart.defaultUnitCost ?? ''),
    });
    setEditing(true);
  };

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPart || editSaving) return;
    setEditError('');

    const name = String(editValues.name ?? '').trim();
    const cat = String(editValues.category ?? '').trim();
    const unit = String(editValues.unitOfMeasure ?? '');
    const reorder = Number(editValues.minReorderLevel);
    const unitCost = Number(editValues.defaultUnitCost);

    if (name.length < 1 || name.length > 150) {
      setEditError(t.inventory.errPartName);
      return;
    }
    if (cat.length < 1 || cat.length > 50) {
      setEditError(t.inventory.errCategory);
      return;
    }
    if (unit.trim().length < 1 || unit.length > 20) {
      setEditError(t.inventory.errUnit);
      return;
    }
    if (!Number.isFinite(reorder) || reorder < 0) {
      setEditError(t.inventory.errMinReorder);
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setEditError(t.inventory.errDefaultCost);
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        ...normalize(editValues, editFields),
        ...(selectedPart.defaultSupplierId ? { defaultSupplierId: selectedPart.defaultSupplierId } : {}),
      };
      const { data } = await api.put(`/api/v1/parts/${selectedPart.id}`, payload);
      setSelectedPart(data);
      setEditing(false);
      setSuccessMessage(t.inventory.updatedMsg);
      await resource.refresh();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setEditSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!selectedPart || archiveSaving) return;
    setEditError('');
    setSuccessMessage('');
    setArchiveSaving(true);
    try {
      const action = selectedPart.active ? 'archive' : 'unarchive';
      const { data } = await api.post(`/api/v1/parts/${selectedPart.id}/${action}`);
      setSelectedPart(data);
      setConfirmArchive(false);
      setSuccessMessage(data.active ? t.inventory.unarchivedMsg : t.inventory.archivedMsg);
      await resource.refresh();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setArchiveSaving(false);
    }
  };

  const hasActiveFilters = Boolean(
    searchInput || categoryInput || search || category || lowStockOnly || includeArchived,
  );

  return (
    <Page
      title={t.inventory.title}
      subtitle={t.inventory.subtitle}
      action={
        <div className="page-actions">
          <StockMovementAction mode="STOCK_IN" onSuccess={(id) => handleStockMovementSuccess(id, t.inventory.stockAddedMsg)} />
          <StockMovementAction mode="STOCK_OUT" onSuccess={(id) => handleStockMovementSuccess(id, t.inventory.stockRemovedMsg)} />
          <Button onClick={() => { setCreateValues({ costCurrency: 'RON' }); setCreateError(''); setCreateModal(true); }}>
            <Plus size={17} />{t.inventory.addPart}
          </Button>
        </div>
      }
    >
      <form className="report-filters" onSubmit={submitSearch}>
        <label style={{ flex: '1 1 220px', maxWidth: 320 }}>
          {t.inventory.searchParts}
          <input
            type="search"
            placeholder={t.inventory.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <label style={{ flex: '0 1 180px' }}>
          {t.inventory.category}
          <input
            type="text"
            placeholder={t.inventory.categoryPlaceholder}
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
          />
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => {
              setLowStockOnly(e.target.checked);
              setPage(0);
            }}
          />
          {t.inventory.lowStockOnly}
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked);
              setPage(0);
            }}
          />
          {t.inventory.includeArchived}
        </label>
        <Button type="submit">{t.common.search}</Button>
        {hasActiveFilters && <Button secondary onClick={clearSearch}>{t.common.clear}</Button>}
      </form>

      {successMessage && <div className="success">{successMessage}</div>}

      <State loading={resource.loading} error={resource.error} empty={!resource.data.length}>
        <Table
          columns={['partCode', 'name', 'category', 'currentQuantity', 'minReorderLevel', 'costCurrency']}
          rows={resource.data}
          onRow={(part) => {
            setSelectedPart(part);
            setEditing(false);
            setConfirmArchive(false);
            setEditError('');
            setSuccessMessage('');
          }}
        />
      </State>
      <PaginationControls page={page} pageInfo={resource.pageInfo} loading={resource.loading} onPageChange={setPage} />

      {createModal && (
        <Modal title={t.inventory.addPart} onClose={() => !createSaving && setCreateModal(false)}>
          <form onSubmit={submitCreate}>
            <Fields fields={createFields} values={createValues} setValues={setCreateValues} />
            {createError && <div className="error">{createError}</div>}
            <div className="modal-actions">
              <Button secondary onClick={() => setCreateModal(false)} disabled={createSaving}>{t.common.cancel}</Button>
              <Button type="submit" disabled={createSaving}>{createSaving ? t.common.saving : t.common.save}</Button>
            </div>
          </form>
        </Modal>
      )}

      {selectedPart && (
        <Modal
          title={editing ? `${t.inventory.editPrefix} ${selectedPart.partCode}` : `${selectedPart.partCode} — ${selectedPart.name}`}
          onClose={() => { setSelectedPart(null); setEditing(false); setConfirmArchive(false); setEditError(''); }}
        >
          {successMessage && !editing && <div className="success">{successMessage}</div>}
          {!editing ? (
            <>
              <div className="detail-grid">
                <div><span>{t.inventory.partCode}</span><strong>{displayVal(selectedPart.partCode)}</strong></div>
                <div><span>{t.inventory.name}</span><strong>{displayVal(selectedPart.name)}</strong></div>
                <div><span>{t.inventory.category}</span><strong>{displayVal(selectedPart.category)}</strong></div>
                <div><span>{t.inventory.description}</span><strong>{displayVal(selectedPart.description)}</strong></div>
                <div><span>{t.inventory.unitOfMeasure}</span><strong>{displayVal(selectedPart.unitOfMeasure)}</strong></div>
                <div><span>{t.inventory.currentQuantity}</span><strong>{displayVal(selectedPart.currentQuantity)}</strong></div>
                <div><span>{t.inventory.minReorderLevel}</span><strong>{displayVal(selectedPart.minReorderLevel)}</strong></div>
                <div><span>{t.inventory.defaultUnitCost}</span><strong>{displayVal(selectedPart.defaultUnitCost)}</strong></div>
                <div><span>{t.inventory.costCurrency}</span><strong>{displayVal(selectedPart.costCurrency)}</strong></div>
                <div><span>{t.inventory.supplier}</span><strong>{displayVal(selectedPart.defaultSupplierName ?? selectedPart.defaultSupplierId)}</strong></div>
                <div><span>{t.inventory.lowStockStatus}</span><strong>{selectedPart.lowStock || selectedPart.isLowStock ? t.inventory.lowStock : t.inventory.ok}</strong></div>
                <div><span>{t.common.archivedStatus}</span><strong>{selectedPart.active ? t.common.active : t.common.archived}</strong></div>
              </div>

              <div className="parts-section">
                <div className="parts-section-header">
                  <strong>{t.inventory.movementHistory}</strong>
                </div>
                {movementsLoading && <div className="muted">{t.inventory.loadingMovements}</div>}
                {!movementsLoading && movementsError && <div className="error">{movementsError}</div>}
                {!movementsLoading && !movementsError && movements.length === 0 && (
                  <div className="muted">{t.inventory.noMovements}</div>
                )}
                {!movementsLoading && !movementsError && movements.length > 0 && (
                  <div className="table-wrap">
                    <table style={{ minWidth: 520 }}>
                      <thead>
                        <tr>
                          <th>{t.inventory.date}</th>
                          <th>{t.inventory.type}</th>
                          <th>{t.inventory.quantity}</th>
                          <th>{t.inventory.unitCost}</th>
                          <th>{t.inventory.reference}</th>
                          <th>{t.inventory.reason}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((m) => {
                          const delta = Number(m.quantityDelta);
                          const deltaText = Number.isFinite(delta) && delta > 0 ? `+${delta}` : String(m.quantityDelta);
                          const refText = m.referenceType
                            ? (m.referenceId ? `${m.referenceType} (${m.referenceId})` : String(m.referenceType))
                            : '—';
                          return (
                            <tr key={m.id}>
                              <td>{m.createdAt ? String(m.createdAt).slice(0, 19).replace('T', ' ') : '—'}</td>
                              <td>{t.inventory.movementTypes[String(m.movementType)] ?? String(m.movementType)}</td>
                              <td><strong>{deltaText}</strong></td>
                              <td>{m.unitCost != null ? `${Number(m.unitCost).toFixed(2)} ${m.currency ?? ''}`.trim() : '—'}</td>
                              <td>{refText}</td>
                              <td>{displayVal(m.reason)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {editError && <div className="error" style={{ marginTop: 14 }}>{editError}</div>}

              {confirmArchive && selectedPart.active && (
                <div className="error" style={{ marginTop: 14 }}>
                  {t.inventory.archivePrompt}
                </div>
              )}

              <div className="modal-actions">
                <Button secondary onClick={() => setSelectedPart(null)}>{t.common.close}</Button>
                {selectedPart.active && (
                  <>
                    <StockMovementAction mode="STOCK_IN" preselectedPart={selectedPart} onSuccess={(id) => handleStockMovementSuccess(id, t.inventory.stockAddedMsg)} />
                    <StockMovementAction mode="STOCK_OUT" preselectedPart={selectedPart} onSuccess={(id) => handleStockMovementSuccess(id, t.inventory.stockRemovedMsg)} />
                  </>
                )}
                {!selectedPart.active ? (
                  <Button secondary onClick={() => void toggleArchive()} disabled={archiveSaving}>
                    {archiveSaving ? t.inventory.unarchiving : t.inventory.unarchive}
                  </Button>
                ) : confirmArchive ? (
                  <>
                    <Button secondary onClick={() => setConfirmArchive(false)} disabled={archiveSaving}>{t.inventory.cancelArchive}</Button>
                    <Button danger onClick={() => void toggleArchive()} disabled={archiveSaving}>
                      {archiveSaving ? t.inventory.archiving : t.inventory.confirmArchiveBtn}
                    </Button>
                  </>
                ) : (
                  <Button secondary onClick={() => setConfirmArchive(true)}>
                    <Archive size={15} />{t.inventory.archive}
                  </Button>
                )}
                <Button onClick={openEdit}>{t.common.edit}</Button>
              </div>
            </>
          ) : (
            <form onSubmit={submitEdit}>
              <Fields fields={editFields} values={editValues} setValues={setEditValues} />
              {editError && <div className="error">{editError}</div>}
              <div className="modal-actions">
                <Button secondary onClick={() => { setEditing(false); setEditError(''); }} disabled={editSaving}>{t.common.cancel}</Button>
                <Button type="submit" disabled={editSaving}>{editSaving ? t.common.saving : t.common.saveChanges}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </Page>
  );
}
type ReportPresetKey = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days';

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BUCHAREST_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getBucharestCalendarParts(referenceDate = new Date()): { year: number; month: number; day: number } {
  const parts = BUCHAREST_DATE_FORMATTER.formatToParts(referenceDate);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { year, month, day };
}

function formatUtcCalendarDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getPresetRange(preset: ReportPresetKey, referenceDate = new Date()): { from: string; to: string } {
  const { year, month, day } = getBucharestCalendarParts(referenceDate);
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  const todayStr = formatUtcCalendarDate(todayUtc);

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'this_week': {
      const daysSinceMonday = (todayUtc.getUTCDay() + 6) % 7;
      const mondayUtc = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
      return { from: formatUtcCalendarDate(mondayUtc), to: todayStr };
    }
    case 'this_month':
      return { from: formatUtcCalendarDate(new Date(Date.UTC(year, month - 1, 1))), to: todayStr };
    case 'last_month': {
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      const firstOfPrevMonth = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
      const lastOfPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 0));
      return {
        from: formatUtcCalendarDate(firstOfPrevMonth),
        to: formatUtcCalendarDate(lastOfPrevMonth),
      };
    }
    case 'last_30_days': {
      const startUtc = new Date(Date.UTC(year, month - 1, day - 29));
      return { from: formatUtcCalendarDate(startUtc), to: todayStr };
    }
  }
}

function Reports({ language }: { language: string }) {
  const t = useT().reports;
  const initialRange = useMemo(() => getPresetRange('this_month'), []);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [activePreset, setActivePreset] = useState<ReportPresetKey | ''>('this_month');

  const [report, setReport] = useState<RecordData | null>(null);
  const [reportPeriod, setReportPeriod] = useState<{ fromDate: string; toDate: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reportRequestIdRef = useRef(0);

  const [fleetUtil, setFleetUtil] = useState<RecordData | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState('');

  const bikes = useResource<RecordData>('/api/v1/bikes', { page: 0, size: 100 });
  const activeBikes = useMemo(
    () => bikes.data.filter((bike) => !bike.archived && !bike.isArchived),
    [bikes.data],
  );
  const [selectedBikeId, setSelectedBikeId] = useState('');
  const [roiData, setRoiData] = useState<RecordData | null>(null);
  const [roiLoading, setRoiLoading] = useState(false);
  const [roiError, setRoiError] = useState('');
  const roiRequestIdRef = useRef(0);

  const money = (values: RecordData | undefined) =>
    currencies
      .map((currency) => `${currency}: ${Number(values?.[currency] ?? 0).toFixed(2)}`)
      .join(' · ');

  const fetchDateRangeReport = async (targetFrom: string, targetTo: string) => {
    setError('');
    if (!targetFrom || !targetTo || targetFrom > targetTo) {
      setError(t.invalidRange);
      return;
    }
    const requestId = reportRequestIdRef.current + 1;
    reportRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const { data } = await api.get('/api/v1/reports/date-range', {
        params: { fromDate: targetFrom, toDate: targetTo },
      });
      if (reportRequestIdRef.current !== requestId) return;
      setReport(data);
      setReportPeriod({ fromDate: targetFrom, toDate: targetTo });
    } catch (err) {
      if (reportRequestIdRef.current !== requestId) return;
      setError(errorMessage(err));
    } finally {
      if (reportRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchDateRangeReport(initialRange.from, initialRange.to);

    let cancelled = false;
    setFleetLoading(true);
    setFleetError('');
    api
      .get('/api/v1/reports/fleet-utilization')
      .then(({ data }) => {
        if (!cancelled) setFleetUtil(data);
      })
      .catch((err) => {
        if (!cancelled) setFleetError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setFleetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadReport = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    await fetchDateRangeReport(fromDate, toDate);
  };

  const loadBikeRoi = async (e: FormEvent) => {
    e.preventDefault();
    if (roiLoading) return;
    setRoiError('');
    if (!selectedBikeId) {
      setRoiError(t.selectBikeRequired);
      return;
    }
    const requestId = roiRequestIdRef.current + 1;
    roiRequestIdRef.current = requestId;
    setRoiLoading(true);
    try {
      const { data } = await api.get(`/api/v1/reports/bike-roi/${selectedBikeId}`);
      if (roiRequestIdRef.current !== requestId) return;
      setRoiData(data);
    } catch (err) {
      if (roiRequestIdRef.current !== requestId) return;
      setRoiData(null);
      setRoiError(errorMessage(err));
    } finally {
      if (roiRequestIdRef.current === requestId) {
        setRoiLoading(false);
      }
    }
  };

  const selectPreset = (preset: ReportPresetKey) => {
    if (loading) return;
    const range = getPresetRange(preset);
    setActivePreset(preset);
    setFromDate(range.from);
    setToDate(range.to);
    void fetchDateRangeReport(range.from, range.to);
  };

  const downloadCsv = () => {
    if (!report || !reportPeriod || loading) return;
    const rows: Array<[string, string, string | number]> = [
      [t.periodLabel, '', `${reportPeriod.fromDate} to ${reportPeriod.toDate}`],
      [t.rentals, '', report.totalRentals ?? 0],
      [t.active, '', report.activeRentals ?? 0],
      [t.closed, '', report.closedRentals ?? 0],
      ...currencies.map((c): [string, string, string] => [
        t.revenue,
        c,
        Number(report.revenue?.[c] ?? 0).toFixed(2),
      ]),
      [t.services, '', report.serviceCount ?? 0],
      ...currencies.map((c): [string, string, string] => [
        t.labour,
        c,
        Number(report.labourCost?.[c] ?? 0).toFixed(2),
      ]),
      ...currencies.map((c): [string, string, string] => [
        t.spareParts,
        c,
        Number(report.sparePartsCost?.[c] ?? 0).toFixed(2),
      ]),
      [t.stockIn, 'QTY', report.stockInQuantity?.TOTAL ?? 0],
      ...currencies.map((c): [string, string, string] => [
        `${t.stockIn} (${t.cost})`,
        c,
        Number(report.stockInCost?.[c] ?? 0).toFixed(2),
      ]),
      [t.stockOut, 'QTY', report.stockOutQuantity?.TOTAL ?? 0],
      ...currencies.map((c): [string, string, string] => [
        `${t.stockOut} (${t.cost})`,
        c,
        Number(report.stockOutCost?.[c] ?? 0).toFixed(2),
      ]),
    ];

    const csvContent = [
      [t.metric, t.currency, t.value],
      ...rows,
    ]
      .map((line) => line.map(escapeCsvCell).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `motorental-report-${reportPeriod.fromDate}-to-${reportPeriod.toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!report || !reportPeriod || loading) return;
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
      setError(t.popupBlocked);
      return;
    }
    const generatedAt = format(new Date(), 'yyyy-MM-dd HH:mm');
    const currencyRows = (values: RecordData | undefined) =>
      currencies
        .map(
          (c) =>
            `<tr><td>${escapeHtml(c)}</td><td style="text-align:right"><strong>${Number(values?.[c] ?? 0).toFixed(2)}</strong></td></tr>`,
        )
        .join('');

    const fleetHtml = fleetUtil
      ? `<div class="card" style="grid-column:1 / -1"><h2>${escapeHtml(t.fleetTitle)}</h2><div class="meta-row"><span>${escapeHtml(t.totalBikes)}: <strong>${escapeHtml(fleetUtil.totalBikes)}</strong></span><span>${escapeHtml(t.rentedBikes)}: <strong>${escapeHtml(fleetUtil.rentedBikes)}</strong></span><span>${escapeHtml(t.availableBikes)}: <strong>${escapeHtml(fleetUtil.availableBikes)}</strong></span><span>${escapeHtml(t.maintenanceBikes)}: <strong>${escapeHtml(fleetUtil.inMaintenanceBikes)}</strong></span><span>${escapeHtml(t.utilizationRate)}: <strong>${Number(fleetUtil.utilizationRate ?? 0).toFixed(1)}%</strong></span></div></div>`
      : '';

    const docLang = language === 'ro' ? 'ro' : 'en';
    popup.document.write(
      `<!doctype html><html lang="${docLang}"><head><meta charset="utf-8" /><title>${escapeHtml(t.pdfTitle)} (${escapeHtml(reportPeriod.fromDate)} - ${escapeHtml(reportPeriod.toDate)})</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#1f2937}h1{margin:0 0 6px;font-size:22px}.subtitle{color:#64748b;margin:0 0 20px;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid #dbe1e8;border-radius:8px;padding:16px}.card h2{font-size:15px;margin:0 0 10px;color:#111827}.value{font-size:22px;font-weight:bold;margin:4px 0 8px}.line{margin:5px 0;font-size:13px}.meta-row{display:flex;gap:18px;flex-wrap:wrap;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}td,th{padding:5px 0;border-bottom:1px solid #edf0f3;text-align:left}</style></head><body><h1>${escapeHtml(t.pdfTitle)}</h1><p class="subtitle">${escapeHtml(t.periodLabel)}: <strong>${escapeHtml(reportPeriod.fromDate)}</strong> — <strong>${escapeHtml(reportPeriod.toDate)}</strong> · ${escapeHtml(t.generatedOn)}: ${escapeHtml(generatedAt)}</p><div class="grid"><div class="card"><h2>${escapeHtml(t.rentals)}</h2><div class="value">${escapeHtml(report.totalRentals)}</div><div class="line">${escapeHtml(t.active)}: ${escapeHtml(report.activeRentals)}</div><div class="line">${escapeHtml(t.closed)}: ${escapeHtml(report.closedRentals)}</div></div><div class="card"><h2>${escapeHtml(t.revenue)}</h2><table><thead><tr><th>${escapeHtml(t.currency)}</th><th style="text-align:right">${escapeHtml(t.amount)}</th></tr></thead><tbody>${currencyRows(report.revenue)}</tbody></table></div><div class="card"><h2>${escapeHtml(t.services)}</h2><div class="value">${escapeHtml(report.serviceCount)}</div><div class="line"><strong>${escapeHtml(t.labour)}</strong></div><table><tbody>${currencyRows(report.labourCost)}</tbody></table><div class="line" style="margin-top:10px"><strong>${escapeHtml(t.spareParts)}</strong></div><table><tbody>${currencyRows(report.sparePartsCost)}</tbody></table></div><div class="card"><h2>${escapeHtml(t.inventory)}</h2><div class="line"><strong>${escapeHtml(t.stockIn)}:</strong> ${escapeHtml(report.stockInQuantity?.TOTAL ?? 0)}</div><table><tbody>${currencyRows(report.stockInCost)}</tbody></table><div class="line" style="margin-top:10px"><strong>${escapeHtml(t.stockOut)}:</strong> ${escapeHtml(report.stockOutQuantity?.TOTAL ?? 0)}</div><table><tbody>${currencyRows(report.stockOutCost)}</tbody></table></div>${fleetHtml}</div><script>window.onload=()=>window.print();</script></body></html>`,
    );
    popup.document.close();
  };

  const presetKeys: ReportPresetKey[] = ['today', 'this_week', 'this_month', 'last_month', 'last_30_days'];

  return (
    <Page title={t.title} subtitle={t.subtitle}>
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>{t.fleetTitle}</h2>
            <p className="muted">{t.fleetSubtitle}</p>
          </div>
          <BarChart3 />
        </div>
        {fleetLoading ? (
          <p className="muted" style={{ marginTop: 14 }}>{t.loading}</p>
        ) : fleetError ? (
          <div className="error" style={{ marginTop: 14 }}>{fleetError}</div>
        ) : fleetUtil ? (
          <>
            <div className="kpi-grid" style={{ marginTop: 16, marginBottom: 14 }}>
              <div className="kpi"><span>{t.totalBikes}</span><strong>{fleetUtil.totalBikes}</strong></div>
              <div className="kpi"><span>{t.rentedBikes}</span><strong>{fleetUtil.rentedBikes}</strong></div>
              <div className="kpi"><span>{t.availableBikes}</span><strong>{fleetUtil.availableBikes}</strong></div>
              <div className="kpi"><span>{t.maintenanceBikes}</span><strong>{fleetUtil.inMaintenanceBikes}</strong></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="muted">{t.utilizationRate}</span>
              <strong>{Number(fleetUtil.utilizationRate ?? 0).toFixed(1)}%</strong>
            </div>
            <div className="progress"><span style={{ width: `${Math.min(100, Number(fleetUtil.utilizationRate || 0))}%` }} /></div>
          </>
        ) : null}
      </div>

      <div className="preset-row">
        {presetKeys.map((key) => (
          <Button
            key={key}
            secondary={activePreset !== key}
            disabled={loading}
            onClick={() => selectPreset(key)}
          >
            {t.presets[key]}
          </Button>
        ))}
      </div>

      <form className="report-filters" onSubmit={loadReport}>
        <label>
          {t.fromDate}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setActivePreset('');
            }}
            required
          />
        </label>
        <label>
          {t.toDate}
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setActivePreset('');
            }}
            required
          />
        </label>
        <Button type="submit" disabled={loading}>
          {loading ? t.loading : t.generate}
        </Button>
        {report && reportPeriod && (
          <>
            <Button secondary disabled={loading} onClick={downloadCsv}>
              {t.downloadCsv}
            </Button>
            <Button secondary disabled={loading} onClick={downloadPdf}>
              {t.downloadPdf}
            </Button>
          </>
        )}
      </form>

      {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}
      {loading && !report && <div className="state">{t.loading}</div>}
      {!report && !loading && !error && <div className="state">{t.empty}</div>}
      {report && (
        <div className="report-grid">
          <div className="panel">
            <h2>{t.rentals}</h2>
            <div className="report-value">{report.totalRentals}</div>
            <p className="muted">{t.active}: {report.activeRentals} · {t.closed}: {report.closedRentals}</p>
          </div>
          <div className="panel">
            <h2>{t.revenue}</h2>
            <p>{money(report.revenue)}</p>
          </div>
          <div className="panel">
            <h2>{t.services}</h2>
            <div className="report-value">{report.serviceCount}</div>
            <p>{t.labour}: {money(report.labourCost)}</p>
            <p>{t.spareParts}: {money(report.sparePartsCost)}</p>
          </div>
          <div className="panel">
            <h2>{t.inventory}</h2>
            <p>{t.stockIn}: {report.stockInQuantity?.TOTAL || 0} ({t.cost}: {money(report.stockInCost)})</p>
            <p>{t.stockOut}: {report.stockOutQuantity?.TOTAL || 0} ({t.cost}: {money(report.stockOutCost)})</p>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 24 }}>
        <div className="panel-title">
          <div>
            <h2>{t.bikeRoiTitle}</h2>
            <p className="muted">{t.bikeRoiSubtitle}</p>
          </div>
          <CircleDollarSign />
        </div>

        <form className="report-filters" style={{ marginTop: 16 }} onSubmit={loadBikeRoi}>
          <label>
            {t.selectBike}
            <select
              value={selectedBikeId}
              disabled={bikes.loading || roiLoading}
              onChange={(e) => {
                setSelectedBikeId(e.target.value);
                setRoiError('');
              }}
            >
              <option value="">{t.selectBikePlaceholder}</option>
              {activeBikes.map((bike) => (
                <option key={bike.id} value={bike.id}>
                  {bike.registrationNumber} — {bike.make} {bike.model}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={roiLoading || bikes.loading || !selectedBikeId}>
            {roiLoading ? t.loading : t.generateRoi}
          </Button>
        </form>

        {bikes.error && <div className="error" style={{ marginBottom: 14 }}>{bikes.error}</div>}
        {roiError && <div className="error" style={{ marginBottom: 14 }}>{roiError}</div>}
        {roiLoading && <div className="state">{t.loading}</div>}
        {!roiLoading && !roiError && !roiData && (
          <div className="state">{t.bikeRoiEmpty}</div>
        )}
        {!roiLoading && roiData && (
          <>
            <div className="detail-grid" style={{ marginBottom: 16 }}>
              <div>
                <span>{t.registrationNumber}</span>
                <strong>{displayVal(roiData.registrationNumber)}</strong>
              </div>
              <div>
                <span>{t.makeModel}</span>
                <strong>{displayVal(roiData.makeModel)}</strong>
              </div>
            </div>
            <div className="balance-grid">
              {[
                [t.totalRevenue, roiData.totalRevenue],
                [t.totalMaintenanceCost, roiData.totalMaintenanceCost],
                [t.netProfit, roiData.netProfit],
              ].map(([label, map]) => (
                <div className="balance-card" key={String(label)}>
                  <b>{label}</b>
                  {currencies.map((c) => (
                    <div key={c}>
                      <span>{c}</span>
                      <strong>{Number((map as RecordData | undefined)?.[c] ?? 0).toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
function SettingsPage({ language, setLanguage }: { language: string; setLanguage: (v: string) => void }) {
  const t = useT();
  const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'RON');
  const [error, setError] = useState('');
  const save = async (kind: 'language' | 'currency', value: string) => {
    setError('');
    try {
      await api.patch(`/api/v1/auth/profile/${kind}`, kind === 'language' ? { preferredLanguage: value } : { preferredCurrency: value });
      localStorage.setItem(kind === 'language' ? 'language' : 'currency', value);
      if (kind === 'language') setLanguage(value);
      else setCurrency(value);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return <Page title={t.settings.title} subtitle={t.settings.subtitle}>{error && <div className="error">{error}</div>}<div className="settings-card"><Languages /><div><h2>{t.settings.language}</h2><p className="muted">{t.settings.languageDesc}</p></div><select value={language} onChange={e => void save('language', e.target.value)}><option value="en">English</option><option value="ro">Română</option></select></div><div className="settings-card"><CircleDollarSign /><div><h2>{t.settings.currencyDisplay}</h2><p className="muted">{t.settings.currencyDesc}</p></div><select value={currency} onChange={e => void save('currency', e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></div></Page>;
}
function More({ user, logout }: { user: User; logout: () => void | Promise<void> }) {
  const t = useT();
  return <Page title={t.account.title} subtitle={t.account.subtitle}><div className="profile-card"><div className="avatar">{user.fullName?.[0] || 'O'}</div><div><h2>{user.fullName}</h2><p className="muted">{user.email} · {user.role}</p></div></div><Button onClick={logout}><LogOut size={17} />{t.nav.signOut}</Button></Page>;
}

export default App;
