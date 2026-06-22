# CloudFront Core Architecture Answers

## Review Request

Please grade these answers, explain what is correct or incorrect, and create a results Markdown file with suggested improvements.

## Test Metadata

- Library: AWS CloudFront and Route 53 Deep Knowledge Test
- Source: /Users/ken/Documents/workspace/sandbox/test/examples/aws-cloudfront-route53-deep-test.json
- Topic: CloudFront CDN fundamentals
- Questions answered: 10 of 10
- Exported: 4/20/2026, 12:56:10 AM

## Instructions

Answer from memory. For single-choice questions, pick the best answer. For multiple-choice questions, select every correct option. For written questions, explain the mechanism, not just the label.

## Answers

### 1. What is the primary job of Amazon CloudFront in a web architecture?

**Question type:** single_choice

To deliver content, APIs, and applications through AWS edge locations while reducing latency and origin load

### 2. Describe the request path when a viewer requests https://www.example.com/app.js through CloudFront and the object is not already in the nearest edge cache.

**Question type:** long_answer

When a viewer requests a domain through cloudfront the request path is:
User -> DNS -> Cloudfront -> Viewer Request(Lambdas or functions) -> Edge Cache -> Origin Request

### 3. In CloudFront, what is a distribution?

**Question type:** short_answer

In Cloudfront, a distribution basically represents an entity of cloudfront for your service. The distribution is the network for all your edge locations, holds the edge caches, and the lambda@edge and functions.

### 4. Which statement best distinguishes CloudFront edge locations from Regional Edge Caches?

**Question type:** single_choice

Edge locations serve viewers directly; Regional Edge Caches sit between edge locations and origins to improve cache hit ratio

### 5. Which of these are valid CloudFront origin types? Select all that apply.

**Question type:** multiple_choice

- S3 bucket
- Application Load Balancer
- EC2 or custom HTTP server
- API Gateway
- MediaPackage or MediaStore
- On-premises HTTP server

### 6. What does a CloudFront cache behavior control?

**Question type:** short_answer

The cloudfront cache behavior controls which requests make it to the origin or not, if the request has a cache key that matches the existing caches, we will just return the standard HTML.

### 7. If multiple cache behaviors could match a request path, what is the safest mental model?

**Question type:** single_choice

Ordered cache behaviors are evaluated by path pattern, and the default behavior catches anything not matched

### 8. CloudFront can only serve static objects and should not be used in front of dynamic APIs.

**Question type:** true_false

False

### 9. What problem does CloudFront Origin Shield primarily solve?

**Question type:** single_choice

It adds a centralized caching layer to reduce duplicate origin fetches across edge locations

### 10. Explain CloudFront origin failover. What signals can cause CloudFront to use the secondary origin, and what kinds of architectures benefit from it?

**Question type:** long_answer

Cloudfront origin failover is when one of our origins isn't working which causing cloudfront to shift to a different origin. Some signals that can cause this are alarms going off, metrics for the origin returns 500 errors, and other monitoring things. The kinds of architecture that benefit from this are the ones where multiple origins can serve the same type of traffic.

## Grading Summary

**Overall result:** 6 fully correct, 4 partial / incorrect.

You got questions 1, 4, 5, 7, 8, and 9 correct. The main gaps are in questions 2, 3, 6, and 10. The pattern is not that you misunderstood CloudFront at a high level. The pattern is that your answers often named the right concept but did not include the mechanism CloudFront actually uses.

That distinction matters because CloudFront questions often test whether you can reason through the moving parts: DNS, edge location, cache lookup, regional edge cache, origin, cache behavior, origin group, and failover criteria.

Sources used for this review:

- Local test source: `examples/aws-cloudfront-route53-deep-test.json`
- AWS CloudFront distribution documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.html>
- AWS CloudFront cache behavior documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html>
- AWS CloudFront caching and availability documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ConfiguringCaching.html>
- AWS CloudFront Origin Shield documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html>
- AWS CloudFront origin failover documentation: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/high_availability_origin_failover.html>

## Detailed Explanations For Missed Questions

### Question 2: Request path on a cache miss

**Your answer:**

> When a viewer requests a domain through cloudfront the request path is:
> User -> DNS -> Cloudfront -> Viewer Request(Lambdas or functions) -> Edge Cache -> Origin Request

**Grade:** Partial.

**What you got right:**

- You correctly started with the viewer and DNS.
- You correctly included CloudFront.
- You correctly mentioned viewer request processing, which is where CloudFront Functions and Lambda@Edge viewer-request code can run.
- You correctly understood that the request can continue to origin if CloudFront cannot serve it from cache.

**What was missing or inaccurate:**

The answer skips the most important cache-miss mechanics. A strong answer should say that DNS resolves the viewer-facing name, such as `www.example.com`, to the CloudFront distribution. The viewer connects to a nearby CloudFront edge location / point of presence. CloudFront then checks the edge cache for the object. If the object is not present or is stale, CloudFront may check a Regional Edge Cache or Origin Shield, depending on the distribution and cache path, before going all the way to the origin. After CloudFront gets the object, it returns the response to the viewer and caches the object according to the cache behavior, cache policy, TTLs, and origin cache headers.

The phrase `Origin Request` in your answer also blurs two different ideas:

- **Origin request as a lifecycle event:** an origin-request Lambda@Edge trigger can run only when CloudFront is about to send a request to the origin.
- **Origin fetch as a network action:** CloudFront sends the request to the configured origin, such as S3, an ALB, API Gateway, or a custom HTTP server.

Those are related, but not identical. The lifecycle event is optional programmable logic; the origin fetch is the actual request CloudFront makes when it cannot satisfy the request from cache.

**Correct model answer:**

When a viewer requests `https://www.example.com/app.js`, DNS resolves `www.example.com` to the CloudFront distribution. The viewer connects to a nearby CloudFront edge location. CloudFront processes any viewer-request function, evaluates the matching cache behavior, and looks for the object in the edge cache. If the object is not cached there, CloudFront can check the Regional Edge Cache and, if configured, Origin Shield. If the object is still not cached, CloudFront sends an origin request to the configured origin. The origin returns the object, CloudFront applies response processing, stores the response according to the relevant cache rules, and returns it to the viewer.

**Why this matters:**

The missed piece is the layered cache hierarchy. CloudFront is not simply `viewer -> edge -> origin`. AWS describes CloudFront caching as a way to serve more objects from caches closer to users and reduce origin requests. Regional Edge Caches and Origin Shield exist specifically to reduce repeated fetches from the origin when multiple edge locations miss for the same object.

**Memory hook:**

Think: **DNS chooses CloudFront; CloudFront chooses behavior; cache layers try first; origin is the fallback source of truth.**

### Question 3: What is a distribution?

**Your answer:**

> In Cloudfront, a distribution basically represents an entity of cloudfront for your service. The distribution is the network for all your edge locations, holds the edge caches, and the lambda@edge and functions.

**Grade:** Partial.

**What you got right:**

- You understood that a distribution is the CloudFront resource representing delivery for your service.
- You connected a distribution to edge delivery.
- You knew that Lambda@Edge and CloudFront Functions can be associated with delivery behavior.

**What was missing or inaccurate:**

A distribution is primarily a **configuration object**, not "the network" itself. The AWS edge network exists independently; your distribution tells CloudFront how to use that network for your application.

A distribution defines things like:

- Viewer-facing domain names / alternate domain names.
- Origins CloudFront can fetch from.
- Default and ordered cache behaviors.
- Which path patterns route to which origins.
- Viewer protocol policy, such as redirect HTTP to HTTPS or HTTPS only.
- Cache policy, origin request policy, and response headers policy.
- Security settings such as WAF association, signed URL / signed cookie requirements, and geo restrictions.
- Logging settings.
- Edge function associations.

Your answer overemphasized physical infrastructure and underemphasized configuration. A distribution does not literally "hold the edge caches." Instead, CloudFront uses its global infrastructure to cache and serve content according to the distribution configuration.

**Correct model answer:**

A CloudFront distribution is the configuration resource that tells CloudFront how to deliver your content. It defines the viewer-facing hostnames, origins, cache behaviors, path routing, cache policies, origin request policies, security settings, logging, and optional edge function associations used when serving requests.

**Why this matters:**

This question is testing whether you understand the boundary between CloudFront's global infrastructure and your application-specific configuration. The distribution is your control plane object. Edge locations, regional caches, and the CloudFront network are the data plane CloudFront uses to execute that configuration.

**Memory hook:**

Think: **A distribution is the delivery rulebook for one CloudFront-backed app or site.**

### Question 6: What does a cache behavior control?

**Your answer:**

> The cloudfront cache behavior controls which requests make it to the origin or not, if the request has a cache key that matches the existing caches, we will just return the standard HTML.

**Grade:** Partial / mostly incorrect.

**What you got right:**

- You correctly connected cache behaviors to whether CloudFront can serve something from cache or has to go to origin.
- You correctly mentioned the cache key as part of cache reuse.

**What was missing or inaccurate:**

A cache behavior is broader than "does the request go to origin?" A cache behavior maps a path pattern to a set of delivery rules. It decides how CloudFront handles requests that match that path.

A cache behavior controls settings such as:

- The path pattern, such as `/api/*`, `/images/*`, or the default `*`.
- The origin or origin group CloudFront uses for matching requests.
- Viewer protocol policy, such as allowing HTTP and HTTPS, redirecting HTTP to HTTPS, or HTTPS only.
- Allowed HTTP methods, such as `GET`/`HEAD` only or all methods for APIs.
- Cached HTTP methods, usually `GET` and `HEAD`, and optionally `OPTIONS`.
- Cache policy, which controls what goes into the cache key and the TTL behavior.
- Origin request policy, which controls additional headers, cookies, and query strings sent to origin.
- Response headers policy, such as adding security or CORS headers.
- Compression.
- Signed URL / signed cookie requirements.
- CloudFront Functions or Lambda@Edge associations.

The phrase "return the standard HTML" is too narrow. CloudFront can cache and return many object types: JavaScript, CSS, images, video segments, API responses, JSON, HTML, and more. It does not specifically return "standard HTML"; it returns the cached response that matches the cache key.

Also, cache behavior and cache key are related but separate:

- **Cache behavior:** the rule set selected by path pattern.
- **Cache key:** the request attributes used to decide whether a cached response can be reused.

For example, `/assets/app.js` might match an `/assets/*` cache behavior. That behavior might use a cache policy where the cache key includes the path plus selected query strings but no cookies. If a later request has the same cache key and the cached object is fresh, CloudFront returns the cached response. If not, it fetches from the origin configured by that behavior.

**Correct model answer:**

A CloudFront cache behavior controls how CloudFront handles requests that match a path pattern. It selects the origin or origin group and applies delivery rules such as viewer protocol policy, allowed methods, cached methods, cache policy, origin request policy, response headers policy, compression, signed URL or signed cookie requirements, and edge function associations.

**Why this matters:**

Cache behaviors are one of the main routing and policy tools inside a distribution. They are how one distribution can send `/api/*` to an ALB with all HTTP methods allowed, send `/assets/*` to S3 with long cache TTLs, require signed cookies for `/private/*`, and redirect HTTP to HTTPS for everything else.

**Memory hook:**

Think: **Cache behavior = path match + origin choice + request/response/cache/security rules.**

### Question 10: CloudFront origin failover

**Your answer:**

> Cloudfront origin failover is when one of our origins isn't working which causing cloudfront to shift to a different origin. Some signals that can cause this are alarms going off, metrics for the origin returns 500 errors, and other monitoring things. The kinds of architecture that benefit from this are the ones where multiple origins can serve the same type of traffic.

**Grade:** Partial.

**What you got right:**

- You correctly understood the high-level idea: CloudFront can use another origin when the primary origin is unhealthy or failing.
- You correctly mentioned 500 errors as one possible kind of failure signal.
- You correctly identified that failover helps when multiple origins can serve compatible traffic.

**What was missing or inaccurate:**

CloudFront origin failover is not driven by CloudWatch alarms or arbitrary monitoring signals. It is configured inside CloudFront using an **origin group**. The origin group contains a primary origin and a secondary origin. A cache behavior points to that origin group instead of pointing directly to one origin.

CloudFront sends requests to the primary origin first. It only sends the request to the secondary origin when the primary origin fails according to CloudFront's configured failover criteria.

The failover signals are specific:

- The primary origin returns an HTTP status code configured for failover.
- CloudFront cannot connect to the primary origin, when `503` is configured as a failover status code.
- The primary origin times out, when `504` is configured as a failover status code.

Common failover status codes include server-side error responses such as `500`, `502`, `503`, and `504`, depending on how the origin group is configured.

Another important detail: CloudFront origin failover applies to cache misses. If CloudFront already has a fresh cached response, it can return that cached response without contacting either origin. When it does need the origin, it tries the primary first for each request. It does not permanently mark the primary as dead just because an earlier request failed over.

Also, this is different from Route 53 DNS failover. Route 53 DNS failover changes which DNS answer clients receive. CloudFront origin failover happens inside CloudFront after the viewer has already reached the distribution.

**Correct model answer:**

CloudFront origin failover uses an origin group with a primary origin and a secondary origin. A cache behavior routes matching requests to that origin group. On a cache miss, CloudFront tries the primary origin first. If the primary origin returns a configured failover HTTP status code, or if CloudFront cannot connect to the origin or the origin times out under the relevant configured failure criteria, CloudFront retries the request against the secondary origin. Architectures that benefit include active/passive multi-origin setups, static websites with an S3 backup origin, applications with a secondary Region, media workloads with redundant origins, and sites that can serve a static fallback during primary application failure.

**Why this matters:**

The important correction is that failover is deterministic CloudFront behavior, not a response to external alarms. Monitoring can alert humans or automation, but CloudFront origin failover itself is based on origin group configuration and the response/connection/timeout result of the request.

This also affects architecture. Origin failover works best when both origins can safely answer the same kind of request. It is natural for static assets, read-heavy content, replicated media, static fallback pages, or multi-Region read paths. It is more complicated for write-heavy APIs because failover could create consistency, authentication, idempotency, or data ownership problems. AWS also documents method limits for origin failover: failover is for `GET`, `HEAD`, and `OPTIONS` requests, not methods like `POST` or `PUT`.

**Memory hook:**

Think: **Origin group tries primary first; configured failures trigger one-request fallback to secondary.**

## Quick Corrections To Memorize

- **Request flow:** DNS -> nearby CloudFront edge -> cache behavior -> edge cache lookup -> regional cache / Origin Shield if applicable -> origin fetch -> cache response -> viewer.
- **Distribution:** the CloudFront configuration for how to deliver a site/app/API, not the physical edge network itself.
- **Cache behavior:** path-based rule set that chooses an origin and applies cache, protocol, method, security, header, and function rules.
- **Origin failover:** origin group with primary and secondary origins; CloudFront fails over based on configured HTTP status codes, connection failure, or timeout, not CloudWatch alarms.
