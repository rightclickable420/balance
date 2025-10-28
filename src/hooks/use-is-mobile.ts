"use client"

import { useEffect, useState } from "react"

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      // Primary check: screen width
      const isSmallScreen = window.innerWidth < 768

      // Secondary check: user agent for mobile devices
      const userAgent = navigator.userAgent.toLowerCase()
      const isMobileUA =
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)

      // Only consider it mobile if screen is small OR has mobile user agent
      // This prevents touchscreen laptops from being detected as mobile
      setIsMobile(isSmallScreen || isMobileUA)
    }

    checkMobile()

    // Re-check on resize
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}
