# CloudFront Caching, Policies, and HTTP Answers

## Review Request

Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.

## Test Metadata

- Library: AWS CloudFront and Route 53 Deep Knowledge Test
- Source: /Users/ken/Documents/workspace/sandbox/test/examples/aws-cloudfront-route53-deep-test.json
- Topic: Cache keys, forwarding, TTLs, and HTTP behavior
- Questions answered: 10 of 10
- Exported: 4/20/2026, 1:12:11 AM

## Instructions

Focus on what changes the cache key, what is forwarded to origin, and what controls freshness.

## Answers

### 1. What is a CloudFront cache key?

**Question type:** short_answer

A cloudfront cache key is a key that determines which items it should be caching and for how long. It typically includes the cookies, header, path, and other details sent with the request.

### 2. Which answer best describes the difference between a cache policy and an origin request policy?

**Question type:** single_choice

A cache policy controls what varies the cache key; an origin request policy controls additional viewer request data forwarded to the origin

### 3. Why can forwarding all cookies, all headers, or all query strings reduce cache effectiveness?

**Question type:** single_choice

It creates many cache variants, so fewer requests share the same cached object

### 4. Explain how CloudFront minimum TTL, default TTL, maximum TTL, and origin Cache-Control headers interact.

**Question type:** long_answer

I can't fully explain this mostly because I don't know the exact values of cloudfront minimum TTL, default, and maximum TTL. I also don't know the origin Cache-Control headers and how they iteract. Here is my best guess: origin Cache-Control headers are headers from the origin that tells cloudfront how it can go about controlling the cache. The origin Cache-Control headers have to follow cloudfront's minimum and maximum ttl for the cache. The default TTL is whats set when nothing is being sent from the origin.

### 5. What does a CloudFront invalidation do?

**Question type:** single_choice

Marks cached objects as stale/removed at CloudFront so future requests fetch fresh content

### 6. When would you prefer file versioning such as app.a1b2c3.js over CloudFront invalidations, and when would invalidation still be useful?

**Question type:** long_answer

I am not that familiar with the file versioning strategy but I can try to answer the question. I will assume file versioning just means, if we have cache content, we just go into our buckets and update all of them to point to another name for the assets. You would prefer file versioning if you only wanted to target a small group of cached content and it is easy to just update the reference to it. Invalidation would be useful if there is a systemic problem that requires all cache assets to be cleared.

### 7. Which cache behavior setting matters when placing CloudFront in front of an API that uses POST, PUT, PATCH, or DELETE?

**Question type:** single_choice

Allowed HTTP methods

### 8. CloudFront can cache responses to every HTTP method, including POST and DELETE, in the same way it caches GET.

**Question type:** true_false

True

### 9. What does CloudFront automatic compression do, and what request header is usually involved?

**Question type:** short_answer

I don't have a clue about the cloudfront automatic compression system.

### 10. Which CloudFront feature is best suited for adding headers like HSTS, CSP, CORS, or custom security headers without changing origin code?

**Question type:** single_choice

Response headers policy

## Grading Summary

**Overall result:** 5 fully correct, 3 partial, 2 incorrect.

You got questions 2, 3, 5, 7, and 10 correct. Questions 1, 4, and 6 were partial. Questions 8 and 9 were incorrect.

The main pattern is that you understand the high-level goal of CloudFront caching, but some of the exact control surfaces are still fuzzy:

- A **cache key** decides whether two requests can reuse the same cached response.
- A **cache policy** controls the cache key and TTL settings.
- An **origin request policy** forwards extra request data to origin without necessarily changing the cache key.
- CloudFront caches only `GET` and `HEAD` by default, with optional `OPTIONS`; it does not cache `POST`, `PUT`, `PATCH`, or `DELETE` responses like `GET`.
- File versioning and invalidation solve related but different cache freshness problems.

Sources used for this review:

- Local test source: `examples/aws-cloudfront-route53-deep-test.json`
- AWS CloudFront cache key documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html>
- AWS CloudFront cache policy documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html>
- AWS CloudFront origin request policy documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-request-understand-origin-request-policy.html>
- AWS CloudFront cache/origin request policy interaction documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-how-origin-request-policies-and-cache-policies-work-together.html>
- AWS CloudFront cache behavior documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html>
- AWS CloudFront invalidation and versioning documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html>
- AWS CloudFront compression documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html>
- AWS CloudFront response headers policy documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/modifying-response-headers.html>

## Detailed Explanations For Missed Questions

### Question 1: What is a CloudFront cache key?

**Your answer:**

> A cloudfront cache key is a key that determines which items it should be caching and for how long. It typically includes the cookies, header, path, and other details sent with the request.

**Grade:** Partial.

**What you got right:**

- You correctly understood that the cache key is used to decide cache identity.
- You correctly named common request attributes that can participate in the cache key, such as headers and cookies.
- You correctly associated the cache key with CloudFront's caching behavior.

**What was missing or inaccurate:**

The cache key does **not** determine how long something is cached. TTL settings and origin freshness headers determine freshness duration. The cache key determines whether one viewer request is considered equivalent to another viewer request for cache reuse.

The clean definition is: the cache key is the set of request attributes CloudFront uses to decide whether a request can reuse a cached response.

For example, imagine these two requests:

- `/products?id=123&color=red`
- `/products?id=123&color=blue`

If the cache policy includes the `color` query string in the cache key, CloudFront treats those as separate cache entries. If the cache policy does not include `color`, CloudFront may treat them as the same cached object. That is powerful, but dangerous if the origin actually returns different content for red and blue.

The cache key can include:

- The distribution domain and requested path by default.
- Selected query strings.
- Selected headers.
- Selected cookies.
- Compression-related values, such as normalized `Accept-Encoding`, when Gzip or Brotli caching support is enabled.

The key idea is not "what should be cached and for how long." It is "which request attributes make one cached response different from another."

**Correct model answer:**

A CloudFront cache key is the unique identifier CloudFront derives from a viewer request to decide whether the request is a cache hit. It includes the default request identity, such as distribution and path, plus any headers, cookies, query strings, or compression settings selected by the cache policy. TTL settings decide how long the cached response stays fresh; the cache key decides whether two requests can share it.

**Why this matters:**

If the cache key includes too many values, CloudFront creates too many variants and your hit ratio drops. If the cache key omits values that actually change the origin response, CloudFront can serve the wrong response to viewers. Good CloudFront design is mostly about finding the smallest cache key that still preserves correctness.

**Memory hook:**

Think: **cache key = "same response or different response?" TTL = "fresh for how long?"**

### Question 4: Minimum TTL, default TTL, maximum TTL, and origin Cache-Control

**Your answer:**

> I can't fully explain this mostly because I don't know the exact values of cloudfront minimum TTL, default, and maximum TTL. I also don't know the origin Cache-Control headers and how they iteract. Here is my best guess: origin Cache-Control headers are headers from the origin that tells cloudfront how it can go about controlling the cache. The origin Cache-Control headers have to follow cloudfront's minimum and maximum ttl for the cache. The default TTL is whats set when nothing is being sent from the origin.

**Grade:** Partial.

**What you got right:**

- You correctly said origin `Cache-Control` headers can tell CloudFront how to cache.
- You correctly said the default TTL applies when the origin does not send cache freshness information.
- You correctly understood that minimum and maximum TTL constrain origin-provided freshness.

**What was missing or inaccurate:**

You did not need to know the exact numeric values. The question was about the relationship between the settings.

The interaction works like this:

- **Origin `Cache-Control` / `Expires`:** The origin can send headers that say how long the response should be considered fresh.
- **Default TTL:** CloudFront uses this when the origin response does not include freshness headers such as `Cache-Control` or `Expires`.
- **Minimum TTL:** CloudFront can keep an object cached for at least this amount of time. If minimum TTL is greater than zero, CloudFront can cache even when the origin sends directives like `no-cache`, `no-store`, or `private`.
- **Maximum TTL:** CloudFront uses this as an upper bound. If the origin asks for a longer freshness lifetime than the maximum TTL, CloudFront caps it.

The subtle part is the minimum TTL. It is easy to think `Cache-Control: no-store` from the origin always wins. In CloudFront, if your cache policy has a minimum TTL greater than zero, CloudFront may still cache for that minimum period. That is why you need to be careful using nonzero minimum TTLs for private, personalized, or rapidly changing responses.

**Correct model answer:**

Origin `Cache-Control` or `Expires` headers can set how long an object is fresh in CloudFront. If the origin does not provide freshness headers, CloudFront uses the default TTL from the cache policy. The minimum TTL is a floor, so CloudFront keeps the object cached for at least that long, even if the origin asks for a shorter lifetime or sends no-cache-style directives when the minimum TTL is greater than zero. The maximum TTL is a ceiling, so origin-provided freshness cannot make CloudFront keep the object fresh longer than that cap.

**Why this matters:**

This is the heart of CloudFront freshness control. A safe static-asset policy might use long TTLs because files are versioned. An API or HTML policy might use short TTLs or disabled caching because content can change often or vary per user. Misunderstanding minimum TTL can lead to accidentally caching content the origin tried to make uncacheable.

**Memory hook:**

Think: **origin suggests freshness; default fills the blank; minimum is the floor; maximum is the ceiling.**

### Question 6: File versioning vs invalidation

**Your answer:**

> I am not that familiar with the file versioning strategy but I can try to answer the question. I will assume file versioning just means, if we have cache content, we just go into our buckets and update all of them to point to another name for the assets. You would prefer file versioning if you only wanted to target a small group of cached content and it is easy to just update the reference to it. Invalidation would be useful if there is a systemic problem that requires all cache assets to be cleared.

**Grade:** Partial.

**What you got right:**

- You correctly understood that file versioning involves changing the asset name.
- You correctly understood that invalidation is useful when you need CloudFront to stop serving cached content.
- You correctly connected invalidation to broader or urgent cache correction cases.

**What was missing or inaccurate:**

File versioning is not mainly "go into buckets and update all of them." The normal deployment pattern is:

1. Build an asset with a unique filename, such as `app.a1b2c3.js`.
2. Upload it to the origin.
3. Update the HTML or manifest to reference the new filename.
4. Let old cached files expire naturally because new viewers request the new filename.

The filename itself becomes a cache-busting mechanism. Since `app.a1b2c3.js` and `app.d4e5f6.js` are different paths, they have different cache keys. CloudFront does not need to be told that the old file changed; the viewer asks for a new object.

Versioning is especially good for immutable assets:

- JavaScript bundles.
- CSS files.
- Images generated by a build pipeline.
- Font files.
- Any static asset where a content hash can be placed in the filename.

With versioned assets, you can set long cache TTLs because the content at a given versioned filename should not change. A new version gets a new filename.

Invalidation is still useful for:

- HTML files such as `/index.html`, because the URL often stays the same.
- Emergency fixes where a bad unversioned file is already cached.
- Content that cannot easily be renamed.
- Removing sensitive or incorrect content from edge caches before TTL expiry.
- Clearing broad paths during operational incidents, though broad invalidation should be used carefully.

The big tradeoff is operational. Versioning is usually cleaner and cheaper for frequent deploys. Invalidation is a control lever for unversioned paths and urgent corrections.

**Correct model answer:**

Prefer file versioning for static assets that change during deployments, such as `app.a1b2c3.js`, because the changed filename creates a new cache key and avoids ambiguity about which version should be served. Versioned assets can use long TTLs because old and new versions coexist under different names. Use invalidation when the URL cannot change, such as `/index.html`, when you need an emergency correction, when an unversioned object was cached incorrectly, or when you must force CloudFront to fetch a fresh copy before the TTL expires.

**Why this matters:**

Invalidation fights the cache after something has already been cached. Versioning designs the cache behavior so that deploys are naturally safe. In production web apps, hashed filenames for static assets plus short or carefully controlled caching for HTML is a common pattern because it gives both performance and predictable releases.

**Memory hook:**

Think: **versioned filename = new URL, no argument with old cache. Invalidation = same URL, force CloudFront to forget.**

### Question 8: Can CloudFront cache every HTTP method like GET?

**Your answer:**

> True

**Grade:** Incorrect.

**Correct answer:** False.

**Why the answer is false:**

CloudFront does not cache responses to every HTTP method. CloudFront caches responses to `GET` and `HEAD` requests, and it can optionally cache `OPTIONS` responses when configured. It does not cache `POST`, `PUT`, `PATCH`, or `DELETE` responses in the same way it caches `GET`.

This is separate from whether CloudFront can **forward** those methods. A cache behavior can allow all methods so CloudFront can sit in front of APIs that use `POST`, `PUT`, `PATCH`, and `DELETE`. But allowing a method and caching the method's response are different things.

For API traffic:

- `GET /products/123` might be cacheable if the response is public and the cache key is correct.
- `POST /orders` should normally be forwarded to origin and not cached as a shared response.
- `PUT /profile` or `DELETE /resource` changes state and should not be cached like a read response.

**Correct model answer:**

False. CloudFront caches `GET` and `HEAD` responses, and can optionally cache `OPTIONS` responses. It can forward methods such as `POST`, `PUT`, `PATCH`, and `DELETE` when the cache behavior allows them, but it does not cache those methods like `GET`.

**Why this matters:**

This is one of the core distinctions for putting CloudFront in front of APIs. CloudFront can accelerate and protect dynamic APIs even when it is not caching every request. It can provide TLS termination, WAF integration, edge routing, HTTP/2 or HTTP/3 viewer connections, and global network benefits. But you should not expect mutating API methods to be cached.

**Memory hook:**

Think: **Allowed methods decide what CloudFront accepts and forwards. Cached methods decide what CloudFront can store.**

### Question 9: CloudFront automatic compression

**Your answer:**

> I don't have a clue about the cloudfront automatic compression system.

**Grade:** Incorrect.

**What automatic compression does:**

CloudFront automatic compression lets CloudFront return smaller compressed versions of eligible objects to viewers. Smaller responses can download faster and reduce data transfer size. The usual request header involved is `Accept-Encoding`.

The basic flow is:

1. The viewer sends a request with `Accept-Encoding`, commonly including `gzip`, `br`, or both.
2. CloudFront checks whether a compressed version is already cached.
3. If not cached, CloudFront requests the object from the origin.
4. If the origin already returns a compressed response with `Content-Encoding`, CloudFront can pass that through and cache it.
5. If the origin returns an uncompressed eligible object, CloudFront can compress it, return it to the viewer, and cache the compressed version.

CloudFront compression is not universal. It depends on conditions such as:

- The cache behavior must have automatic compression enabled.
- The viewer must indicate support through `Accept-Encoding`.
- The object must be an eligible content type.
- The object size must fall within CloudFront's supported compression range.
- The response must have a compressible status/body.
- CloudFront will not recompress an object that the origin already marked as compressed with `Content-Encoding`.

The important header is:

- **Request header:** `Accept-Encoding`, where the viewer advertises support for compression such as `gzip` or `br`.

Related response header:

- **Response header:** `Content-Encoding`, where the origin or CloudFront indicates that the response is compressed.

**Correct model answer:**

CloudFront automatic compression compresses eligible objects before sending them to viewers, reducing response size and improving download performance. It depends on the viewer's `Accept-Encoding` request header, commonly `gzip` or `br` for Brotli. If the object is eligible and not already compressed by the origin, CloudFront can compress it, return it, and cache the compressed version.

**Why this matters:**

Compression is a performance feature, not a cache invalidation or origin routing feature. It also affects the cache key because CloudFront needs to distinguish compressed variants when compression support is enabled. A viewer that supports Brotli or Gzip can receive a different encoded representation than one that does not.

**Memory hook:**

Think: **viewer says "I accept gzip/br"; CloudFront says "great, I can serve a smaller version."**

## Quick Corrections To Memorize

- **Cache key:** decides whether two requests can share a cached response; TTL decides how long it is fresh.
- **Cache policy:** controls cache key values and TTLs.
- **Origin request policy:** forwards extra headers, cookies, or query strings to origin without adding them to the cache key.
- **TTL interaction:** origin headers set freshness, default TTL fills in when origin headers are absent, minimum TTL is the floor, maximum TTL is the ceiling.
- **Versioning:** best for static assets with changed filenames and long TTLs.
- **Invalidation:** best for same-URL updates, HTML, emergency fixes, and unversioned objects.
- **Cached methods:** CloudFront caches `GET` and `HEAD`, optionally `OPTIONS`; not `POST`, `PUT`, `PATCH`, or `DELETE`.
- **Compression:** usually uses `Accept-Encoding` from the viewer and returns `Content-Encoding` in the response.
