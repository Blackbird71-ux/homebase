import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  await requireSession()
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')
  const location = searchParams.get('location') // city name fallback
  const type = searchParams.get('type') // 'current' (default) or 'forecast'

  const apiKey = process.env.OPENWEATHER_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'Weather is not configured. Ask an admin to add OPENWEATHER_API_KEY to the environment.',
        needsConfig: true,
      },
      { status: 503 }
    )
  }

  try {
    // ── Forecast endpoint (5-day / 3-hour) ──────────────────────────
    if (type === 'forecast') {
      let forecastUrl: string
      if (lat && lon) {
        forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&appid=${apiKey}&units=metric`
      } else if (location) {
        forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`
      } else {
        return NextResponse.json(
          { error: 'Provide lat/lon or location query parameter.' },
          { status: 400 }
        )
      }

      const res = await fetch(forecastUrl, { next: { revalidate: 300 } })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return NextResponse.json(
          { error: data.message ?? 'Failed to fetch forecast data.' },
          { status: res.status }
        )
      }

      const data = await res.json()

      // Group forecast entries by date (YYYY-MM-DD)
      const dailyForecasts: Record<string, {
        tempMin: number
        tempMax: number
        condition: string
        description: string
        icon: string
        humidity: number
        windSpeed: number
        entries: number
      }> = {}

      for (const item of data.list) {
        const dateStr = item.dt_txt.split(' ')[0] // "2026-05-16"
        if (!dailyForecasts[dateStr]) {
          dailyForecasts[dateStr] = {
            tempMin: item.main.temp_min,
            tempMax: item.main.temp_max,
            condition: item.weather[0]?.main ?? 'Unknown',
            description: item.weather[0]?.description ?? '',
            icon: item.weather[0]?.icon ?? '01d',
            humidity: item.main.humidity,
            windSpeed: Math.round(item.wind.speed * 3.6),
            entries: 1,
          }
        } else {
          const day = dailyForecasts[dateStr]
          day.tempMin = Math.min(day.tempMin, item.main.temp_min)
          day.tempMax = Math.max(day.tempMax, item.main.temp_max)
          day.humidity = Math.round((day.humidity * day.entries + item.main.humidity) / (day.entries + 1))
          day.windSpeed = Math.round((day.windSpeed * day.entries + Math.round(item.wind.speed * 3.6)) / (day.entries + 1))
          day.entries += 1
          // Use midday entry for condition/icon
          const hour = item.dt_txt.split(' ')[1]?.split(':')[0]
          if (hour === '12') {
            day.condition = item.weather[0]?.main ?? day.condition
            day.description = item.weather[0]?.description ?? day.description
            day.icon = item.weather[0]?.icon ?? day.icon
          }
        }
      }

      // Convert to array sorted by date
      const forecast = Object.entries(dailyForecasts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, day]) => ({
          date,
          tempMin: Math.round(day.tempMin),
          tempMax: Math.round(day.tempMax),
          condition: day.condition,
          description: day.description,
          icon: day.icon,
          humidity: day.humidity,
          windSpeed: day.windSpeed,
        }))

      return NextResponse.json({
        location: data.city?.name ?? location ?? 'Unknown',
        forecast,
      })
    }

    // ── Current weather endpoint (default) ──────────────────────────
    let url: string

    if (lat && lon) {
      // Use coordinates (from browser geolocation)
      url = `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&appid=${apiKey}&units=metric`
    } else if (location) {
      // Use city name (from settings fallback)
      url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`
    } else {
      return NextResponse.json(
        { error: 'Provide lat/lon or location query parameter.' },
        { status: 400 }
      )
    }

    const res = await fetch(url, { next: { revalidate: 300 } }) // cache for 5 min

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: data.message ?? 'Failed to fetch weather data.' },
        { status: res.status }
      )
    }

    const data = await res.json()

    return NextResponse.json({
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      condition: data.weather[0]?.main ?? 'Unknown',
      description: data.weather[0]?.description ?? '',
      icon: data.weather[0]?.icon ?? '01d',
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 3.6), // convert m/s to km/h
      location: data.name,
    })
  } catch {
    return NextResponse.json(
      { error: 'Unable to fetch weather data. Please try again later.' },
      { status: 500 }
    )
  }
}
