package com.solqtech.app

import java.net.URI

/** Navigation allowlist; subdomains are intentionally not trusted by default. */
internal object NavigationPolicy {
    fun isInternal(url: String): Boolean = try {
        val uri = URI(url)
        uri.scheme.equals("https", ignoreCase = true) && uri.rawUserInfo == null &&
            uri.port in setOf(-1, 443) &&
            uri.host?.lowercase() in setOf("solqtech.com", "www.solqtech.com")
    } catch (_: java.net.URISyntaxException) {
        false
    }
}
