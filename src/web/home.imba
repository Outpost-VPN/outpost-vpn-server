import {t} from './i18n.imba'
import {fmt, trafficPeriods} from './context.imba'

tag outpost-home-server
	store = null

	get metrics
		store.data.system.metrics or {cpu: {percent: 0}, memory: {used: 0, total: 0, percent: 0}, disk: {used: 0, total: 0, percent: 0}}

	get rows
		[
			{title: 'CPU', percent: metrics.cpu.percent, detail: ''}
			{title: t('Память'), percent: metrics.memory.percent, detail: t('{used} из {total}', {used: fmt.bytes(metrics.memory.used), total: fmt.bytes(metrics.memory.total)})}
			{title: t('Диск'), percent: metrics.disk.percent, detail: t('{used} из {total}', {used: fmt.bytes(metrics.disk.used), total: fmt.bytes(metrics.disk.total)})}
		]

	get network
		metrics.network or {download: 0, upload: 0, history: []}

	get signal
		const points = network.history or []
		return [network.download + network.upload] unless points.length
		points.map do(point) point.download + point.upload

	<self.outpost-card>
		<header>
			<div.server-icon>
				<outpost-icon name="hard-drives">
				<i.health>
			<div>
				<h2> t('Сервер')
				<p> 'Ubuntu 24.04'
			<span.uptime> fmt.uptime(store.data.system.uptime)
		<div.metrics>
			for row in rows
				<div.metric .disk=(row.title == t('Диск'))>
					<strong> row.title
					<outpost-gauge value=row.percent>
					<small> row.detail
			<div.metric.network>
				<strong> t('Сеть сейчас')
				<div.network-body>
					<outpost-line-chart mini=true points=signal>
					<div.rates>
						<span.download>
							<outpost-icon name="arrow-down">
							<span> fmt.rate(network.download)
						<span.upload>
							<outpost-icon name="arrow-up">
							<span> fmt.rate(network.upload)

	css self
		d:block px:22px pb:20px
		header d:grid gtc:54px minmax(0,1fr) auto ai:center g:15px m:0 -22px p:12px 22px rdt:13px bgc:var(--outpost-section) border-bottom:1px solid var(--outpost-line)
		.server-icon pos:relative s:50px d:grid ja:center rd:11px bd:1px solid color-mix(in srgb, var(--outpost-success) 30%, var(--outpost-success-soft)) bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:25px
		.server-icon > .health pos:absolute r:-4px b:-4px s:16px d:block rd:full bd:3px solid var(--outpost-white) bgc:var(--outpost-success)
		header h2 c:color-mix(in srgb, var(--outpost-text) 58%, var(--outpost-muted)) fs:18px fw:750
		.uptime d:inline-flex ai:center h:21px px:8px bd:1px solid color-mix(in srgb, var(--outpost-success) 30%, var(--outpost-success-soft)) rd:full bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:11px fw:650 white-space:nowrap
		header p mt:6px c:var(--outpost-muted) fs:13px
		.metrics d:grid gtc:repeat(4, minmax(0,1fr)) ai:stretch pt:16px
		.metric d:grid ja:center ta:center px:18px
		.metric + .metric border-left:1px solid var(--outpost-line)
		.metric strong, .metric small d:block
		.metric strong mb:5px c:var(--outpost-muted) fs:12px fw:650
		.metric small mih:13px mt:-1px c:var(--outpost-muted) fs:11px white-space:nowrap
		.network-body w:100% d:grid gtc:minmax(72px,1fr) auto ai:center g:16px mt:4px
		.network-body outpost-line-chart w:100% h:38px
		.rates d:grid g:7px ta:left white-space:nowrap
		.rates span d:flex ai:center g:7px c:var(--outpost-navy) fs:12px fw:650
		.rates outpost-icon fs:14px
		.rates .download outpost-icon c:var(--outpost-brand)
		.rates .upload outpost-icon c:var(--outpost-success)
		@media(max-width: 900px)
			.metrics gtc:repeat(2, minmax(0,1fr)) rg:18px
			.metric.disk border-left:0
		@media(max-width: 560px)
			.metrics gtc:repeat(3, minmax(0,1fr)) rg:18px
			.metric px:4px
			.metric + .metric
				pt:0 border-top:0 border-left:1px solid var(--outpost-line)
				&.network gc:1 / -1 pt:18px border-left:0 border-top:1px solid var(--outpost-line)
			.metric.disk border-left:1px solid var(--outpost-line)
			.metric small fs:10px

tag outpost-home-traffic
	store = null

	get chart
		fmt.sample(store.data.traffic.series).map(do(point) point.upload + point.download)

	get ceiling
		const peak = Math.max(...chart, 4)
		const unit = Math.pow(1024, Math.min(Math.floor(Math.log(peak) / Math.log(1024)), 4))
		const amount = peak / unit
		const magnitude = Math.pow(10, Math.floor(Math.log10(amount)))
		const normalized = amount / magnitude
		const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
		multiplier * magnitude * unit

	get scale
		[ceiling, ceiling * 3 / 4, ceiling / 2, ceiling / 4, 0]

	get dates
		const points = store.data.traffic.series or []
		const first = store.data.traffic.from or points[0]..bucket_at or new Date
		const last = store.data.traffic.to or new Date
		[fmt.day(new Date(first)), fmt.day(new Date(last))]

	get intervals
		const periods = {today: 6, '24h': 6, week: 7, '7d': 7, month: 6, '30d': 6, year: 12, '365d': 12}
		periods[store.trafficPeriod] or 6

	def volume value
		fmt.bytes(value).replace('.', ',')

	def period value
		await store.period(value)
		self.querySelector('details.period').removeAttribute('open')
		window.requestAnimationFrame do self.querySelector('outpost-line-chart').draw!

	<self.outpost-card>
		<header>
			<div.summary>
				<h2>
					<span> t('Трафик {period}:', {period: fmt.period(store.trafficPeriod).short})
					<strong> volume(store.data.traffic.totals.upload + store.data.traffic.totals.download)
				<div.totals>
					<span>
						<small> t('Загружено:')
						<strong> volume(store.data.traffic.totals.download)
					<span>
						<small> t('Отдано:')
						<strong> volume(store.data.traffic.totals.upload)
			<details.period>
				<summary>
					<span> fmt.period(store.trafficPeriod).label
					<outpost-icon name="caret-down">
				<menu>
					for option in trafficPeriods
						<button type="button" .active=(option.id == store.trafficPeriod) @click=period(option.id)>
							<span> t(option.label)
							if option.id == store.trafficPeriod
								<outpost-icon name="check">
		<div.chart>
			<div.chart-scale>
				for value in scale
					<span> volume(value)
			<div.chart-bands aria-hidden="true">
				for index in [0 ... intervals]
					<i .alternate=(index % 2)>
			<outpost-line-chart points=chart ceiling=ceiling>
			<div.chart-dates>
				for date in dates
					<span> date

	css self
		d:flex fld:column h:340px px:24px pb:24px
		header d:flex ai:center jc:space-between g:20px m:0 -24px p:14px 24px rdt:13px bgc:var(--outpost-section) border-bottom:1px solid var(--outpost-line)
		.summary d:flex ai:baseline g:20px min-width:0
		header h2 d:flex ai:baseline g:7px c:color-mix(in srgb, var(--outpost-text) 58%, var(--outpost-muted)) fs:18px fw:750 white-space:nowrap
		header strong c:var(--outpost-brand) fs:20px fw:750
		.totals d:flex ai:baseline g:18px white-space:nowrap
		.totals > span d:flex ai:baseline g:6px
		.totals small c:var(--outpost-muted) fs:12px
		.totals strong c:var(--outpost-navy) fs:13px fw:750
		.period pos:relative
		.period summary d:flex ai:center g:9px p:8px 11px bd:1px solid var(--outpost-line) rd:8px c:var(--outpost-text) fs:12px fw:600 cur:pointer list-style:none
		.period summary::-webkit-details-marker d:none
		.period[open] summary outpost-icon rotate:180deg
		.period menu pos:absolute t:calc(100% + 8px) r:0 zi:5 miw:220px d:grid g:3px m:0 p:6px bd:1px solid var(--outpost-line) rd:11px bgc:var(--outpost-white) bxs:0 14px 36px black/10 list-style:none
		.period menu button d:grid gtc:1fr 18px ai:center g:10px p:9px 10px bd:0 rd:7px bgc:transparent c:var(--outpost-muted) fs:12px ta:left
		.period menu button bgc@hover:var(--outpost-soft) c@hover:var(--outpost-brand)
		.period menu button.active c:var(--outpost-brand) fw:700
		.chart pos:relative fl:1 mih:0 mt:36px pb:24px
		.chart-bands pos:absolute t:0 b:24px l:0 r:0 d:flex of:hidden pe:none
		.chart-bands i fl:1
		.chart-bands i bdl:1px dashed blue2/70
		.chart-bands i@first-child bdl:0
		.chart-bands i.alternate bgc:blue0/45
		.chart outpost-line-chart pos:relative zi:1 h:100% w:100% d:block
		.chart-scale pos:absolute t:0 b:24px l:0 zi:2 w:45px d:flex fld:column jc:space-between c:var(--outpost-muted) fs:10px lh:1 pe:none
		.chart-scale span w:max-content pr:4px bgc:var(--outpost-white)
		.chart-dates pos:absolute b:0 l:0 r:0 h:24px d:flex ai:end jc:space-between c:var(--outpost-muted) fs:11px
		@media(max-width: 620px)
			header d:grid g:12px p:14px 18px
			.summary d:grid g:7px
			header h2 jc:space-between g:12px fs:17px flw:nowrap white-space:nowrap
			header h2 strong fs:19px white-space:nowrap
			.totals g:12px
			.totals small fs:11px
			.totals strong fs:12px fw:650
			.period w:100%
			.period order:-1
			.period summary jc:space-between
			.period menu w:100% miw:0
			.chart-scale w:38px

tag outpost-home-connections
	store = null

	get connections do store.data.connections
	get online do connections.filter(do(connection) fmt.connectionOnline(connection)).length

	get maximum
		Math.max(...connections.map(do(connection) fmt.connectionTraffic(connection, store.data.traffic)), 1)

	def usage connection
		fmt.connectionTraffic(connection, store.data.traffic)

	def scale connection
		Math.max(0, Math.min(100, usage(connection) / maximum * 100))

	def activity connection
		return t('connection.suspended') if connection.suspended_at
		return t('Онлайн') if fmt.connectionOnline(connection)
		fmt.seen(connection)

	def connectionspage
		store.goto('/connections')

	<self.outpost-card>
		<header>
			<h2> t('Подключения')
			<span.online-count>
				<i>
				<span> t('{count} онлайн', {count: online})
		<div.columns>
			<span> t('Подключение')
			<span> t('Использовано')
			<span> t('Активность')
		<div.rows>
			for connection in connections
				<button.user type="button" @click=connectionspage>
					<div.connection>
						<outpost-avatar value=connection.avatar size="34">
						<i .online=fmt.connectionOnline(connection)>
						<strong> connection.name
					<div.usage>
						<div.bar><span [w:{scale(connection)}%]>
						<b> fmt.bytes(usage(connection))
					<span.activity .online=fmt.connectionOnline(connection) .paused=!!connection.suspended_at> activity(connection)

	css self
		d:block mt:18px px:24px pb:24px
		header d:flex ai:center jc:space-between g:16px m:0 -24px p:14px 24px rdt:13px bgc:var(--outpost-section) border-bottom:1px solid var(--outpost-line)
		h2 c:color-mix(in srgb, var(--outpost-text) 58%, var(--outpost-muted)) fs:18px fw:750
		.online-count d:inline-flex ai:center g:7px h:28px px:10px bd:1px solid color-mix(in srgb, var(--outpost-success) 30%, var(--outpost-success-soft)) rd:full bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:11px fw:700 white-space:nowrap
		.online-count i s:7px d:block rd:full bgc:currentColor
		.columns, .user gtc:minmax(220px,1.05fr) minmax(300px,1.25fr) minmax(180px,.8fr)
		.columns d:grid ai:center pt:12px pb:9px c:var(--outpost-muted) fs:10px
		.user w:100% mih:56px d:grid ai:center p:0 bd:0 border-top:1px solid var(--outpost-line) bgc:transparent c:var(--outpost-text) ta:left
		.user@hover bgc:var(--outpost-soft)
		.connection pos:relative d:grid gtc:34px 1fr ai:center g:12px
		.connection > i pos:absolute l:27px b:1px s:8px d:block rd:full bd:2px solid var(--outpost-white) bgc:#C7CFDA
		.connection > i.online bgc:var(--outpost-success)
		.connection strong fs:13px
		.usage d:grid gtc:minmax(90px,190px) 70px ai:center g:14px
		.bar h:5px of:hidden rd:full bgc:var(--outpost-line)
		.bar span h:100% d:block rd:full bgc:var(--outpost-brand)
		.usage b c:var(--outpost-navy) fs:12px fw:700 white-space:nowrap
		.activity c:var(--outpost-muted) fs:12px white-space:nowrap
		.activity.online c:var(--outpost-success)
		.activity.paused c:var(--outpost-warning)
		@media(max-width: 900px)
			.columns, .user gtc:minmax(180px,1fr) minmax(220px,1fr) 150px
		@media(max-width: 720px)
			.columns gtc:1fr 120px
			.columns span:nth-child(2) d:none
			.user gtc:minmax(0,1fr) auto gtr:auto auto cg:12px rg:7px py:10px
			.connection gc:1 gr:1
			.activity gc:2 gr:1 justify-self:end
			.usage d:grid gc:1 / -1 gr:2 gtc:minmax(0,1fr) 70px g:10px pl:46px
			.usage b fs:11px ta:right

tag outpost-home
	store = null

	<self>
		<header.overview-head>
			<span.eyebrow> t('ОБЗОР')
			<outpost-header title=t('overview.title') subtitle=t('overview.subtitle')>
		<outpost-home-server store=store>
		<outpost-home-traffic store=store>
		<outpost-home-connections store=store>

	css self
		d:block c:var(--outpost-text)
		.overview-head d:block
		.overview-head .eyebrow d:block mb:14px c:var(--outpost-brand) fs:12px fw:750 ls:.1em
		outpost-home-server mt:26px
		outpost-home-traffic mt:18px

tag outpost-line-chart
	points = []
	secondary = []
	mini = false
	tone = 'default'
	edge = true
	ceiling = null
	observer = null

	def mount
		observer = new ResizeObserver(do draw!)
		observer.observe(self)
		window.requestAnimationFrame(do draw!)

	def unmount
		observer && observer.disconnect!

	def draw
		const canvas = self.querySelector('canvas')
		return unless canvas and (points.length or secondary.length)
		const width = canvas.clientWidth
		const height = canvas.clientHeight
		return unless width and height
		const ratio = window.devicePixelRatio or 1
		canvas.width = width * ratio
		canvas.height = height * ratio
		const context = canvas.getContext('2d')
		context.scale(ratio, ratio)
		context.clearRect(0, 0, width, height)
		unless mini
			context.strokeStyle = window.getComputedStyle(self).getPropertyValue('--outpost-line')
			context.lineWidth = 1
			for index in [0 ... 5]
				continue if !edge and index == 0
				const position = 1 + index * (height - 2) / 4
				context.beginPath!
				context.moveTo(0, position)
				context.lineTo(width, position)
				context.stroke!
		const values = points.map(Number)
		const comparison = secondary.map(Number)
		const combined = values.concat(comparison)
		const low = mini ? Math.min(...combined) : 0
		const high = mini ? Math.max(...combined) : Number(ceiling or Math.max(...combined, 1))
		const pad = mini ? 2 : 1
		const count = Math.max(values.length, comparison.length)
		const x = do(index) pad + index / Math.max(count - 1, 1) * (width - pad * 2)
		const y = do(value) height - pad - (value - low) / Math.max(high - low, 1) * (height - pad * 2)
		const styles = window.getComputedStyle(self)
		const primary = styles.getPropertyValue('--chart-primary').trim! or styles.color
		const alternate = styles.getPropertyValue('--chart-secondary').trim! or primary
		const plot = do(series, color, fill)
			return unless series.length
			context.beginPath!
			series.forEach do(value, index)
				index ? context.lineTo(x(index), y(value)) : context.moveTo(x(index), y(value))
			context.lineWidth = mini ? 1.7 : 2
			context.lineJoin = 'round'
			context.lineCap = 'round'
			context.strokeStyle = color
			context.stroke!
			if fill
				context.lineTo(width - pad, height - pad)
				context.lineTo(pad, height - pad)
				context.closePath!
				context.globalAlpha = .08
				context.fillStyle = color
				context.fill!
				context.globalAlpha = 1
		plot(values, primary, !mini and !comparison.length)
		plot(comparison, alternate, false)

	<self .mini=mini .neutral=(tone == 'neutral') aria-hidden="true">
		<canvas>

	css self
		d:block c:var(--outpost-brand)
		--chart-primary:var(--outpost-brand)
		--chart-secondary:var(--outpost-warning)
		&.neutral --chart-primary:color-mix(in srgb,var(--outpost-muted) 72%,var(--outpost-text))
		canvas s:100% d:block

tag outpost-sparkline
	points = ''
	tone = 'blue'

	get bars
		const values = points.split(',').map(Number)
		const low = Math.min(...values)
		const high = Math.max(...values)
		values.map(do(value) Math.round(5 + (value - low) / Math.max(high - low, 1) * 22))

	<self .green=(tone == 'green') aria-hidden="true">
		for height in bars
			<span style="height:{height}px">

	css
		width: 90px
		height: 28px
		display: flex
		align-items: flex-end
		gap: 2px
		span flex: 1; min-width: 2px; border-radius: 2px 2px 0 0; background: #0B56D9
		&.green span background: var(--outpost-success)
