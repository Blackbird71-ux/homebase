import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  await requireSession()
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')
  const location = searchParams.get('location') // city name fallback

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
