import {avatarUrl} from './avatar-picker.imba'
import {intl, t} from './i18n.imba'
import YAML from 'yaml'

export const routeActions = [
	{id: 'DIRECT', label: 'Напрямую'}
	{id: 'PROXY', label: 'Через прокси'}
	{id: 'BLOCK', label: 'Блокировать'}
]
export const routeMatchers = [
	{id: 'DOMAIN', label: 'Точный домен', hint: 'Только один хост', placeholder: 'example.com'}
	{id: 'SUFFIX', label: 'Доменный суффикс', hint: 'Домен, TLD и поддомены', placeholder: 'example.com или ru'}
	{id: 'IP_CIDR', label: 'IP / CIDR', hint: 'Адрес или подсеть', placeholder: '192.0.2.0/24'}
	{id: 'GEOSITE', label: 'Geosite', hint: 'Группа доменов', placeholder: 'google'}
	{id: 'GEOIP', label: 'GeoIP', hint: 'Страна или регион', placeholder: 'cn'}
]
export const routeIcons = {DOMAIN: 'globe-simple', SUFFIX: 'asterisk', IP_CIDR: 'network', GEOSITE: 'stack', GEOIP: 'stack-simple'}
export const diagnostics = do(view)
	const text = view.state.doc.toString!
	const parsed = YAML.parseDocument(text, {prettyErrors: false})
	const size = view.state.doc.length
	parsed.errors.concat(parsed.warnings).map do(issue)
		const range = issue.pos or [0, 0]
		const from = Math.max(0, Math.min(range[0] or 0, size))
		const to = Math.max(from, Math.min(range[1] or from + 1, size))
		{from: from, to: to, severity: parsed.errors.includes(issue) ? 'error' : 'warning', message: issue.message}
export const localNetworkValues = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
export const deviceImages = {
	phone: '/assets/devices/device-phone-v1.png'
	tablet: '/assets/devices/device-tablet-v1.png'
	computer: '/assets/devices/device-computer-v1.png'
	vr: '/assets/devices/device-vr-v1.png'
	television: '/assets/devices/device-television-v1.png'
	other: '/assets/devices/device-other-v1.png'
}
export const trafficPeriods = [
	{id: 'today', label: 'Сегодня', short: 'сегодня'}
	{id: '24h', label: 'Последние 24 часа', short: 'за 24 часа'}
	{id: 'week', label: 'Текущая неделя', short: 'за текущую неделю'}
	{id: '7d', label: 'Последние 7 дней', short: 'за 7 дней'}
	{id: 'month', label: 'Текущий месяц', short: 'за текущий месяц'}
	{id: '30d', label: 'Последние 30 дней', short: 'за 30 дней'}
	{id: 'year', label: 'Текущий год', short: 'за текущий год'}
	{id: '365d', label: 'Последние 365 дней', short: 'за 365 дней'}
]
export const fmt = {
	initials: do(name)
		name.split(/\s+/).map(do(word) word[0]).join('').slice(0, 2).toUpperCase!
	avatar: do(value)
		avatarUrl(value)
	action: do(action)
		return t('routes.direct') if action == 'DIRECT'
		return t('routes.proxy') if action == 'PROXY'
		t('routes.block')
	matcher: do(matcher)
		const labels = {DOMAIN: t('Точный домен'), SUFFIX: t('Доменный суффикс'), IP_CIDR: 'IP / CIDR', GEOSITE: 'Geosite', GEOIP: 'GeoIP'}
		labels[matcher]
	serviceName: do(name)
		const names = {'outpost': 'Outpost', nginx: 'Nginx', 'hysteria-server': 'Hysteria 2', xray: 'Xray'}
		names[name] or name
	serviceIcon: do(name)
		return 'activity' if name == 'hysteria-server'
		return 'shield-check' if name == 'xray'
		return 'globe' if name == 'nginx'
		'circles-three-plus'
	bytes: do(value)
		const amount = Number(value or 0)
		return t('0 Б') if !amount
		const units = [t('Б'), t('КБ'), t('МБ'), t('ГБ'), t('ТБ')]
		const index = Math.max(0, Math.min(Math.floor(Math.log(amount) / Math.log(1024)), units.length - 1))
		"{new Intl.NumberFormat(intl!, {maximumFractionDigits: index > 2 ? 1 : 0}).format(amount / Math.pow(1024, index))} {units[index]}"
	rate: do(value)
		const amount = Number(value or 0) * 8
		return t('0 бит/с') unless amount
		const units = [t('бит/с'), t('Кбит/с'), t('Мбит/с'), t('Гбит/с')]
		const index = Math.min(Math.floor(Math.log(amount) / Math.log(1000)), units.length - 1)
		const scaled = amount / Math.pow(1000, index)
		"{new Intl.NumberFormat(intl!, {maximumFractionDigits: scaled < 10 and index ? 1 : 0}).format(scaled)} {units[index]}"
	percent: do(value, total)
		return '0%' if !total
		new Intl.NumberFormat(intl!, {style: 'percent', maximumFractionDigits: 0}).format(value / total)
	connectionTrafficRow: do(connection, traffic)
		traffic.connections.find do(item) item.connection_id == connection.id
	connectionTraffic: do(connection, traffic)
		const row = fmt.connectionTrafficRow(connection, traffic)
		row ? row.upload + row.download : 0
	connectionOnline: do(connection)
		!connection.suspended_at and connection.presence == 'online'
	connectionPresence: do(connection)
		return t('connection.suspended') if connection.suspended_at
		return t('Онлайн') if fmt.connectionOnline(connection)
		return t('Готовим') if connection.status == 'provisioning'
		return t('Перевыпускаем') if connection.status == 'rotating'
		return t('Архивируем') if connection.status == 'archiving'
		return t('Статус неизвестен') if connection.presence == 'unknown'
		t('Не в сети')
	seen: do(connection)
		return t('В сети') if fmt.connectionOnline(connection)
		return t('Не использовалось') unless connection.last_seen_at
		const value = new Date(connection.last_seen_at)
		const today = new Date
		const start = new Date(today.getFullYear!, today.getMonth!, today.getDate!).getTime!
		const day = new Date(value.getFullYear!, value.getMonth!, value.getDate!).getTime!
		return t('Был сегодня, {time}', {time: fmt.time(value)}) if day == start
		return t('Был вчера, {time}', {time: fmt.time(value)}) if day == start - 86400000
		t('Был {day}, {time}', {day: fmt.day(value), time: fmt.time(value)})
	checked: do(value)
		return t('Проверка ещё не выполнялась') unless value
		const minutes = Math.max(0, Math.floor((Date.now! - new Date(value).getTime!) / 60000))
		return t('Проверено только что') if minutes < 1
		return t('Проверено {minutes} мин назад', {minutes: new Intl.NumberFormat(intl!).format(minutes)}) if minutes < 60
		t('Проверено в {time}', {time: fmt.time(value)})
	spark: do(connection, traffic)
		const row = fmt.connectionTrafficRow(connection, traffic)
		return [] unless row and row.series
		row.series.map do(point) point.upload + point.download
	sample: do(series)
		return [] if !series.length
		const step = Math.max(1, Math.ceil(series.length / 80))
		series.filter(do(item, index) index % step == 0)
	bar: do(point, series)
		const max = Math.max(...series.map(do(item) item.upload + item.download), 1)
		Math.max(2, Math.round((point.upload + point.download) / max * 100))
	date: do(value = new Date)
		new Intl.DateTimeFormat(intl!, {day: 'numeric', month: 'long', year: 'numeric'}).format(value)
	day: do(value)
		new Intl.DateTimeFormat(intl!, {day: 'numeric', month: 'short'}).format(value)
	time: do(value)
		new Intl.DateTimeFormat(intl!, {hour: '2-digit', minute: '2-digit'}).format(new Date(value))
	zone: do(zone)
		const parts = new Intl.DateTimeFormat(intl!, {timeZone: zone, timeZoneName: 'longOffset', hour: '2-digit'}).formatToParts(new Date)
		const offset = parts.find(do(part) part.type == 'timeZoneName')..value or 'GMT'
		"{offset.replace('GMT', 'UTC')} — {zone}"
	period: do(value)
		const item = trafficPeriods.find(do(option) option.id == value) or trafficPeriods[5]
		{...item, label: t(item.label), short: t(item.short)}
	time: do(value)
		return '' unless value
		new Intl.DateTimeFormat(intl!, {hour: '2-digit', minute: '2-digit'}).format(new Date(value))
	stamp: do(value)
		return '' unless value
		new Intl.DateTimeFormat(intl!, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value))
	uptime: do(value)
		const days = Math.floor(Number(value or 0) / 86400)
		return t('Работает меньше дня') unless days
		t('Работает {days} дней', {days: new Intl.NumberFormat(intl!).format(days)})
}

export const webauthn = {
	decode: do(options)
		const copy = {...options}
		copy.challenge = fromBase64url(copy.challenge)
		if copy.user
			copy.user = {...copy.user, id: fromBase64url(copy.user.id)}
		if copy.excludeCredentials
			copy.excludeCredentials = copy.excludeCredentials.map(do(item) {...item, id: fromBase64url(item.id)})
		if copy.allowCredentials
			copy.allowCredentials = copy.allowCredentials.map(do(item) {...item, id: fromBase64url(item.id)})
		copy
	json: do(credential)
		const response = credential.response
		const payload = {
			id: credential.id
			rawId: toBase64url(credential.rawId)
			type: credential.type
			clientExtensionResults: credential.getClientExtensionResults!
			authenticatorAttachment: credential.authenticatorAttachment
			response: {clientDataJSON: toBase64url(response.clientDataJSON)}
		}
		if response.attestationObject
			payload.response.attestationObject = toBase64url(response.attestationObject)
			payload.response.transports = response.getTransports ? response.getTransports! : []
		else
			payload.response.authenticatorData = toBase64url(response.authenticatorData)
			payload.response.signature = toBase64url(response.signature)
			payload.response.userHandle = response.userHandle ? toBase64url(response.userHandle) : undefined
		payload
}

def fromBase64url value
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
	const bytes = Uint8Array.from(atob(padded), do(char) char.charCodeAt(0))
	bytes.buffer

def toBase64url buffer
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for byte in bytes
		binary += String.fromCharCode(byte)
	btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(new RegExp('=+$'), '')
