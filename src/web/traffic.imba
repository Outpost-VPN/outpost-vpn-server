import {t} from './i18n.imba'
import {fmt} from './context.imba'

tag matreshka-traffic
	store = null

	<self>
		<matreshka-header title=t('traffic.title') subtitle=t('traffic.subtitle')>
		<div.report-period>
			<matreshka-icon name="calendar-blank">
			<span> fmt.period(store.trafficPeriod).label
		<div.metric-grid>
			<div.metric.matreshka-card>
				<span> t('traffic.total')
				<strong> fmt.bytes(store.data.traffic.totals.upload + store.data.traffic.totals.download)
				<small> 'Входящий и исходящий'
			<div.metric.matreshka-card>
				<span> t('traffic.download')
				<strong> fmt.bytes(store.data.traffic.totals.download)
				<small> 'На устройства'
			<div.metric.matreshka-card>
				<span> t('traffic.upload')
				<strong> fmt.bytes(store.data.traffic.totals.upload)
				<small> 'С устройств'
		<div.traffic-layout>
			<section.matreshka-card.chart-card>
				<h2> 'Динамика'
				<div.chart>
					for point in fmt.sample(store.data.traffic.series)
						<div.bar style="height:{fmt.bar(point, store.data.traffic.series)}%" title=fmt.bytes(point.upload + point.download)>
			<section.matreshka-card.people-traffic>
				<h2> t('traffic.by_people')
				for person in store.data.traffic.people
					<div.traffic-row>
						<div>
							<strong> person.name
							<small> fmt.bytes(person.upload + person.download)
						<span> fmt.percent(person.upload + person.download, store.data.traffic.totals.upload + store.data.traffic.totals.download)
		<section.matreshka-card.device-traffic>
			<h2> t('traffic.by_devices')
			for device in store.data.traffic.devices
				<div.device-row>
					<div>
						<strong> device.name
						<small> "{device.person_name} · {device.engine or 'нет данных'}"
					<span> fmt.bytes(device.upload + device.download)

	css
		.report-period width: fit-content; min-height: 34px; display: flex; align-items: center; gap: 8px; margin-top: 32px; padding: 0 11px; border-radius: 9px; background: #EEF4FD; color: #41638D; font-size: 13px
		.report-period matreshka-icon font-size: 17px
		.metric-grid display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 24px
		.metric padding: 22px
		.metric span, .metric strong, .metric small display: block
		.metric span color: #7C879C; font-size: 13px
		.metric strong margin-top: 12px; color: #071127; font-size: 28px
		.metric small margin-top: 7px; color: #9AA4B6
		.traffic-layout display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; margin-top: 18px
		.chart-card, .people-traffic, .device-traffic padding: 24px
		.chart-card h2, .people-traffic h2, .device-traffic h2 font-size: 18px; margin-bottom: 22px
		.chart height: 230px; display: flex; align-items: flex-end; gap: 3px; border-bottom: 1px solid var(--matreshka-line)
		.bar flex: 1; min-height: 2px; border-radius: 3px 3px 0 0; background: #4B84DE
		.traffic-row, .device-row min-height: 58px; display: grid; grid-template-columns: 1fr auto; align-items: center; border-top: 1px solid var(--matreshka-line)
		.traffic-row strong, .traffic-row small, .device-row strong, .device-row small display: block
		.traffic-row small, .device-row small margin-top: 4px; color: #7C879C
		.traffic-row > span, .device-row > span color: #0A1430; font-weight: 700
		.device-traffic grid-column: 1 / -1
		.device-traffic display: grid; grid-template-columns: repeat(2, 1fr); column-gap: 32px
		.device-traffic h2 grid-column: 1 / -1
		@media(max-width: 760px)
			.metric-grid grid-template-columns: 1fr
			.traffic-layout grid-template-columns: 1fr
			.device-traffic grid-column: auto; display: block
