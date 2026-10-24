// Redis executes each script atomically across API replicas. No in-memory fallback.
export const RESERVE_EMAIL_CODE = `
local cooldown = redis.call('TTL', KEYS[3])
if cooldown > 0 then return {0, cooldown} end
local limits = {30, 5, tonumber(ARGV[4])}
local rateKeys = {KEYS[1], KEYS[2], KEYS[4]}
for i, key in ipairs(rateKeys) do
  if tonumber(redis.call('GET', key) or '0') >= limits[i] then
    return {0, math.max(1, redis.call('TTL', key))}
  end
end
for _, key in ipairs(rateKeys) do
  if redis.call('INCR', key) == 1 then redis.call('EXPIRE', key, 3600) end
end
redis.call('SET', KEYS[3], '1', 'EX', 60)
redis.call('SET', KEYS[5], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[6], ARGV[2], 'EX', ARGV[3])
return {1, 60}
`;

export const READY_EMAIL_CODE = `
local raw = redis.call('GET', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if not raw or ttl <= 0 or redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
local record = cjson.decode(raw)
record.ready = true
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ttl)
return 1
`;

export const CANCEL_EMAIL_CODE = `
redis.call('DEL', KEYS[1])
if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
return 1
`;

export const CONSUME_EMAIL_CODE = `
local count = redis.call('INCR', KEYS[3])
if count == 1 then redis.call('EXPIRE', KEYS[3], 600) end
if count > 30 then return {-1, math.max(1, redis.call('TTL', KEYS[3]))} end
local raw = redis.call('GET', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if not raw or ttl <= 0 or redis.call('GET', KEYS[2]) ~= ARGV[1] then return {0} end
local record = cjson.decode(raw)
if not record.ready or record.binding ~= ARGV[2] or record.purpose ~= ARGV[4]
  or record.userId ~= ARGV[5] or record.email ~= ARGV[6] then return {0} end
if record.digest ~= ARGV[3] then
  record.attempts = record.attempts + 1
  if record.attempts >= 5 then
    redis.call('DEL', KEYS[1], KEYS[2])
  else
    redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ttl)
  end
  return {0}
end
redis.call('DEL', KEYS[1], KEYS[2])
return {1}
`;
