import { useState } from 'react'
import { createPortal } from 'react-dom'
import { User, Phone, Mail, Plus, Pencil, Trash2, Loader2, X, Building2 } from 'lucide-react'
import { counterpartiesApi } from '../../api/client'
import { useToast } from '../ui/use-toast'
import type { ContactPerson, CounterpartyCustomer } from '../../types'

function ContactPersonModal({ counterpartyId, person, onClose, onSaved }: {
  counterpartyId: string
  person?: ContactPerson | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const isEdit = !!person
  const [saving, setSaving] = useState(false)
  
  // POST принимает first_name/last_name/middle_name, PATCH - full_name
  const [firstName, setFirstName] = useState(person?.full_name?.split(' ')[1] || '')
  const [lastName, setLastName] = useState(person?.full_name?.split(' ')[0] || '')
  const [middleName, setMiddleName] = useState(person?.full_name?.split(' ')[2] || '')
  const [fullName, setFullName] = useState(person?.full_name || '')
  const [phone, setPhone] = useState(person?.phone || '')
  const [email, setEmail] = useState(person?.email || '')
  const [position, setPosition] = useState(person?.position || '')
  const [extension, setExtension] = useState(person?.extension || '')
  const [telegram, setTelegram] = useState(person?.messengers?.telegram || '')
  const [vk, setVk] = useState(person?.messengers?.vk || '')

  const submit = async () => {
    if (!isEdit && (!firstName.trim() || !lastName.trim())) {
      toast({ title: 'Заполните имя и фамилию', variant: 'destructive' })
      return
    }
    if (isEdit && !fullName.trim()) {
      toast({ title: 'Заполните ФИО', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const messengers: Record<string,string> = {}
      if (telegram.trim()) messengers.telegram = telegram.trim()
      if (vk.trim()) messengers.vk = vk.trim()
      const mess = Object.keys(messengers).length ? messengers : null

      if (isEdit) {
        await counterpartiesApi.updateContactPerson(counterpartyId, person!.id, {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          position: position.trim() || null,
          extension: extension.trim() || null,
          messengers: mess
        })
      } else {
        await counterpartiesApi.createContactPerson(counterpartyId, {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          middle_name: middleName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          position: position.trim() || null,
          extension: extension.trim() || null,
          messengers: mess
        })
      }
      toast({ title: isEdit ? 'Контакт обновлен' : 'Контакт добавлен' })
      onSaved()
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e?.response?.data?.detail || 'Не удалось сохранить', variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6" style={{boxShadow:'var(--shadow-lg)'}}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">{isEdit ? 'Редактировать контакт' : 'Новый контакт'}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--hover-2)]"><X className="w-5 h-5"/></button>
        </div>
        <div className="space-y-4">
          {isEdit ? (
            <div>
              <label className="text-sm text-[var(--text-muted)]">ФИО *</label>
              <input value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]" placeholder="Иванов Иван Иванович"/>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-sm text-[var(--text-muted)]">Фамилия *</label><input value={lastName} onChange={e=>setLastName(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]"/></div>
              <div><label className="text-sm text-[var(--text-muted)]">Имя *</label><input value={firstName} onChange={e=>setFirstName(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]"/></div>
              <div><label className="text-sm text-[var(--text-muted)]">Отчество</label><input value={middleName} onChange={e=>setMiddleName(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]"/></div>
            </div>
          )}
          <div><label className="text-sm text-[var(--text-muted)]">Должность</label><input value={position} onChange={e=>setPosition(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]" placeholder="Главный бухгалтер"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm text-[var(--text-muted)]">Телефон</label><input value={phone} onChange={e=>setPhone(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]" placeholder="88005553535"/></div>
            <div><label className="text-sm text-[var(--text-muted)]">Доб.</label><input value={extension} onChange={e=>setExtension(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]" placeholder="1234"/></div>
          </div>
          <div><label className="text-sm text-[var(--text-muted)]">Email</label><input value={email} onChange={e=>setEmail(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]" placeholder="user@example.com"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm text-[var(--text-muted)]">Telegram</label><input value={telegram} onChange={e=>setTelegram(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]" placeholder="exampleUser05"/></div>
            <div><label className="text-sm text-[var(--text-muted)]">VK</label><input value={vk} onChange={e=>setVk(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] outline-none focus:border-[var(--accent)]" placeholder="1254752"/></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)]">Отмена</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white flex items-center gap-2 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin"/>} Сохранить</button>
        </div>
      </div>
    </div>, document.body
  )
}

export function ContactsTab({ counterpartyId, persons, customers, onRefresh }: {
  counterpartyId: string
  persons: ContactPerson[]
  customers: CounterpartyCustomer[]
  onRefresh: () => void
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState<ContactPerson | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const handleDelete = async (p: ContactPerson) => {
    if (!confirm(`Удалить "${p.full_name}"?`)) return
    try {
      await counterpartiesApi.deleteContactPerson(counterpartyId, p.id)
      toast({ title: 'Контакт удален' })
      onRefresh()
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e?.response?.data?.detail || 'Не удалось удалить', variant: 'destructive' })
    }
  }

  return (
    <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
      <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5"><User size={18} className="text-[var(--text-primary)]/40"/> Контактные лица {persons.length>0 && <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm">{persons.length}</span>}</h2>
        <button onClick={()=>setShowCreate(true)} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium"><Plus size={16}/> Добавить</button>
      </div>
      <div className="p-6">
        {persons.length===0 ? (
          <div className="text-center py-16">
            <Building2 className="w-10 h-10 text-[var(--text-primary)]/15 mx-auto mb-3"/>
            <p className="text-[var(--text-primary)]/50">Нет контактных лиц</p>
            <p className="text-sm text-[var(--text-primary)]/30 mt-1">Добавьте первый контакт этого контрагента</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {persons.map(p=>(
              <div key={p.id} className="flex items-start justify-between gap-4 py-4 px-2 hover:bg-[var(--hover-1)] rounded-xl">
                <div className="flex gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] font-bold flex-shrink-0">{p.full_name?.[0] || '?'}</div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] truncate">{p.full_name} {p.user_id && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">привязан</span>}</p>
                    {p.position && <p className="text-sm text-[var(--text-primary)]/50">{p.position} {p.extension && `• доб. ${p.extension}`}</p>}
                    <div className="flex flex-wrap gap-3 mt-1.5 text-sm text-[var(--text-primary)]/60">
                      {p.phone && <a href={`tel:${p.phone}`} className="flex items-center gap-1 hover:text-[var(--accent)]"><Phone size={14}/>{p.phone}</a>}
                      {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-1 hover:text-[var(--accent)]"><Mail size={14}/>{p.email}</a>}
                    </div>
                    {p.messengers && Object.keys(p.messengers).length>0 && <p className="text-xs text-[var(--text-primary)]/40 mt-1">Мессенджеры: {Object.entries(p.messengers).map(([k,v])=>`${k}: ${v}`).join(' • ')}</p>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={()=>setEditing(p)} className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/60 hover:text-[var(--text-primary)]"><Pencil size={16}/></button>
                  <button onClick={()=>handleDelete(p)} className="p-2 rounded-lg hover:bg-[var(--accent-soft)] text-[var(--text-primary)]/40 hover:text-[var(--accent)]"><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {(showCreate || editing) && <ContactPersonModal counterpartyId={counterpartyId} person={editing} onClose={()=>{setShowCreate(false);setEditing(null)}} onSaved={()=>{setShowCreate(false);setEditing(null);onRefresh()}}/>}
    </div>
  )
}