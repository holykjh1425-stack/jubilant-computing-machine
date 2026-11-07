package com.solqtech.app

fun main() {
    val allowed = listOf("https://solqtech.com/", "https://www.solqtech.com/privacy.html", "https://SOLQTECH.COM:443/#apply")
    val blocked = listOf("http://solqtech.com", "https://solqtech.com.evil.test/", "https://evil.test/solqtech.com", "https://solqtech.com@evil.test/", "https://evil@solqtech.com/", "https://solqtech.com:444/", "https://untrusted.solqtech.com/", "file:///etc/passwd", "javascript:alert(1)", "intent://solqtech.com", "https://solqtech.com\\@evil.test", "not a url")
    allowed.forEach { check(NavigationPolicy.isInternal(it)) { "Allowed URL rejected: $it" } }
    blocked.forEach { check(!NavigationPolicy.isInternal(it)) { "Unsafe URL accepted: $it" } }
    println("PASS: ${allowed.size + blocked.size} navigation cases")
}
