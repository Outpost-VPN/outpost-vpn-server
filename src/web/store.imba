def pathnow
	const value = window.location.pathname.replace(/^\/admin\/?/, '')
	return value ? "/{value}" : '/'

def canonical path
	const value = path.length > 1 ? path.replace(/\/+$/, '') : path
	const routes = ['/', '/connections', '/protocols', '/routes', '/journal', '/access', '/settings', '/login', '/setup', '/onboarding']
	routes.includes(value) ? value : '/'

def pagetitle path
	return 'Outpost · Первоначальная настройка' if path.startsWith('/setup')
	return 'Outpost · Настройка доступа' if path.startsWith('/onboarding')
	return 'Outpost · Вход' if path.startsWith('/login')
	return 'Outpost · Доступ' if path == '/access'
	return 'Outpost · Настройки панели' if path == '/settings'
	return 'Outpost · Подключения' if path == '/connections'
	return 'Outpost · Маршруты' if path == '/routes'
	return 'Outpost · Протоколы' if path == '/protocols'
	return 'Outpost · Журнал' if path == '/journal'
	'Outpost · Обзор'

export class Store
	data = null
	loading = true
	error = null
	path = canonical(pathnow!)
	dialog = null
	dialogKey = 0
	trigger = null
	selected = null
	confirmation = null
	trafficPeriod = '30d'
	security = null

	def constructor
		const rawPath = pathnow!
		if path != rawPath
			window.history.replaceState({}, '', "/admin{path}")
		try
			trafficPeriod = window.localStorage.getItem('outpost:traffic-period') or '30d'
		catch
			trafficPeriod = '30d'
		window.document.title = pagetitle(path)
		window.addEventListener 'popstate', do
			const raw = pathnow!
			path = canonical(raw)
			window.history.replaceState({}, '', "/admin{path}") if path != raw
			window.document.title = pagetitle(path)
			dialog = null
			imba.commit!
		window.addEventListener 'keydown', do(event)
			return unless dialog
			if event.key == 'Escape'
				event.preventDefault!
				self.close!
			elif event.key == 'Tab'
				self.trap(event)

	def load
		loading = true
		error = null
		try
			const response = await window.fetch("/api/v1/dashboard?period={trafficPeriod}")
			if response.status == 401
				self.goto('/login')
				return
			throw new Error((await response.json!).error.message) if !response.ok
			data = await response.json!
			self.goto('/') if path.startsWith('/login')
		catch issue
			error = issue.message
		finally
			loading = false
			imba.commit!

	def api method, url, body = undefined
		const options = {method: method, headers: {'content-type': 'application/json'}}
		options.body = JSON.stringify(body) if body != undefined
		const response = await window.fetch(url, options)
		const payload = response.status == 204 ? null : await response.json!
		if !response.ok
			throw new Error(payload.error.message)
		return payload

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

	def goto next
		const base = '/admin'
		const target = next.startsWith('/') ? next : "/{next}"
		window.history.pushState({}, '', "{base}{target}")
		path = target
		window.document.title = pagetitle(path)
		dialog = null
		imba.commit!
