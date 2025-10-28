"use client"

import { useEffect, useState } from "react"

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      // Check if screen width is mobile-sized
      const isSmallScreen = window.innerWidth < 768

      // Check if device has touch capability
      const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0

      // Check user agent for mobile devices
      const userAgent = navigator.userAgent.toLowerCase()
      const isMobileUA =
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)

      // Consider it mobile if it has a small screen OR is a touch device with mobile UA
      setIsMobile(isSmallScreen || (hasTouch && isMobileUA))
    }

    checkMobile()

    // Re-check on resize
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}
