#ifndef CLOUD_UPLINK_H
#define CLOUD_UPLINK_H

#include <stddef.h>
#include <stdint.h>

int cloud_uplink_build_body(const char *telemetry_json, char *out, size_t out_size);
int cloud_uplink_build_request(const char *body, char *out, size_t out_size);
int cloud_uplink_should_upload(const char *telemetry_json, const char *last_uploaded,
    uint64_t now_ms, uint64_t last_upload_ms, uint64_t heartbeat_ms);

#ifndef CLOUD_UPLINK_HOST_TEST
void cloud_uplink_start(void);
#endif

#endif
