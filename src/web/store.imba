import {language, setLanguage, t} from './i18n.imba'

def pathnow
	const value = window.location.pathname.replace(/^\/admin\/?/, '')
	return value ? "/{value}" : '/'

def canonical path
	const value = path.length > 1 ? path.replace(/\/+$/, '') : path
	const routes = ['/', '/connections', '/protocols', '/routes', '/journal', '/access', '/settings', '/login', '/onboarding']
	routes.includes(value) ? value : '/'

def pagetitle path
	return "Outpost · {t('title.onboarding')}" if path.startsWith('/onboarding')
	return "Outpost · {t('title.login')}" if path.startsWith('/login')
	return "Outpost · {t('title.access')}" if path == '/access'
	return "Outpost · {t('title.settings')}" if path == '/settings'
	return "Outpost · {t('connections.title')}" if path == '/connections'
	return "Outpost · {t('routes.title')}" if path == '/routes'
	return "Outpost · {t('nav.protocols')}" if path == '/protocols'
	return "Outpost · {t('system.log')}" if path == '/journal'
	"Outpost · {t('title.overview')}"

export class Store
	data = null
	loading = true
	refreshing = false
	error = null
	stale = null
	path = canonical(pathnow!)
	dialog = null
	dialogKey = 0
	trigger = null
	selected = null
	confirmation = null
	trafficPeriod = '30d'
	security = null
	pending = false
	cycle = null
	source = null
	timer = null
	connected = false
	started = false

	def constructor
		const rawPath = pathnow!
		if path != rawPath
			window.history.replaceState({}, '', "/admin{path}")
		try
			trafficPeriod = window.localStorage.getItem('outpost:traffic-period') or '30d'
		catch
			trafficPeriod = '30d'
		title!
		window.addEventListener 'popstate', do
			const raw = pathnow!
			path = canonical(raw)
			window.history.replaceState({}, '', "/admin{path}") if path != raw
			title!
			dialog = null
			imba.commit!
			self.changed!
		window.document.addEventListener 'visibilitychange', do self.visibility!
		window.addEventListener 'online', do self.resume!
		window.addEventListener 'offline', do self.stop!
		window.addEventListener 'keydown', do(event)
			return unless dialog
			if event.key == 'Escape'
				event.preventDefault!
				self.close!
			elif event.key == 'Tab'
				self.trap(event)

	get live?
		!path.startsWith('/login') and !path.startsWith('/onboarding')

	def start
		started = true
		load! if live?

	def destroy
		started = false
		stop!

	def load
		pending = true
		return cycle if cycle
		cycle = drain!
		try
			await cycle
		finally
			cycle = null
			load! if pending

	def drain
		refreshing = true
		while pending
			pending = false
			await pull!
		refreshing = false
		imba.commit!

	def pull
		const initial = !data
		loading = initial
		error = null if initial
		try
			const response = await window.fetch("/api/v1/dashboard?period={trafficPeriod}", {headers: {'X-Outpost-Language': language!}})
			if response.status == 401
				self.expire!
				return
			unless response.ok
				const failure = await response.json!
				throw new Error(self.problem(failure))
			const snapshot = await response.json!
			data = snapshot
			setLanguage(snapshot.auth.owner.language) if snapshot.auth.owner and snapshot.auth.owner.language
			title!
			security = snapshot.security
			stale = null
			error = null
			self.goto('/', false) if path.startsWith('/login')
			self.connect! if live?
		catch issue
			if data
				stale = issue.message
			else
				error = issue.message
		finally
			loading = false
			imba.commit!

	def api method, url, body = undefined
		const options = {method: method, headers: {'content-type': 'application/json', 'X-Outpost-Language': language!}}
		options.body = JSON.stringify(body) if body != undefined
		const response = await window.fetch(url, options)
		const payload = response.status == 204 ? null : await response.json!
		self.expire! if response.status == 401
		if !response.ok
			throw new Error(problem(payload))
		return payload

	def problem payload
		return payload.message if payload and payload.message
		return payload.error.message if payload and payload.error and payload.error.message
		t('error.request')

	def mutate method, url, body = undefined
		try
			const result = await api(method, url, body)
			await load!
			return result
		catch issue
			error = issue.message
			imba.commit!
			throw issue

	def secure
		try
			security = await api('GET', '/api/v1/security')
			data.security = security if data
		catch issue
			error = issue.message
		finally
			imba.commit!

	def period value
		return if value == trafficPeriod
		trafficPeriod = value
		try
			window.localStorage.setItem('outpost:traffic-period', value)
		catch issue
			console.warn '[STORAGE] Traffic period is not persisted:', issue
		try
			data.traffic = await api('GET', "/api/v1/traffic?period={value}")
		catch issue
			error = issue.message
		finally
			imba.commit!

	def signal event
		try
			const update = JSON.parse(event.data or '{}')
			const current = (data and data.revision) or 0
			load! if update.revision > current
		catch
			return

	def connect
		return unless started and data and live? and !window.document.hidden
		return if source
		source = new window.EventSource('/api/v1/dashboard/events')
		source.addEventListener 'open', do
			connected = true
			self.poll(false)
			imba.commit!
		source.addEventListener 'ready', do self.load!
		source.addEventListener 'snapshot', do(event) self.signal(event)
		source.addEventListener 'heartbeat', do
			connected = true
			self.poll(false)
		source.addEventListener 'error', do
			connected = false
			self.poll(true) unless window.document.hidden
			imba.commit!

	def poll enabled
		if enabled
			return if timer
			const tick = do self.load!
			timer = window.setInterval(tick, 30000)
		elif timer
			window.clearInterval(timer)
			timer = null

	def stop
		if source
			source.close!
			source = null
		if timer
			window.clearInterval(timer)
			timer = null
		connected = false

	def visibility
		if window.document.hidden
			stop!
		else
			resume!

	def resume
		return unless started and live? and !window.document.hidden
		load!
		connect!

	def changed
		if live?
			load!
			connect!
		else
			stop!

	def expire
		stop!
		pending = false
		data = null
		security = null
		loading = false
		goto('/login', false) unless path.startsWith('/login')

	def open name
		trigger ||= window.document.activeElement
		dialogKey++
		dialog = name
		error = null
		imba.commit!
		window.requestAnimationFrame do self.focus!

	def close
		const target = trigger
		dialog = null
		selected = null
		confirmation = null
		trigger = null
		imba.commit!
		window.requestAnimationFrame do target.focus! if target and target.isConnected

	def focus
		const views = Array.from(window.document.querySelectorAll('[role="dialog"]'))
		return unless views.length
		const view = views[views.length - 1]
		const target = view.querySelector('[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') or view
		target.focus!

	def trap event
		const views = Array.from(window.document.querySelectorAll('[role="dialog"]'))
		return unless views.length
		const view = views[views.length - 1]
		const items = Array.from(view.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter do(item) !item.hidden and item.getAttribute('aria-hidden') != 'true'
		return unless items.length
		const first = items[0]
		const last = items[items.length - 1]
		if event.shiftKey and window.document.activeElement == first
			event.preventDefault!
			last.focus!
		elif !event.shiftKey and window.document.activeElement == last
			event.preventDefault!
			first.focus!

	def goto next, refresh = true
		const base = '/admin'
		const target = next.startsWith('/') ? next : "/{next}"
		window.history.pushState({}, '', "{base}{target}")
		path = target
		title!
		dialog = null
		imba.commit!
		changed! if refresh

	def title
		window.document.title = pagetitle(path)
