#ifndef CLOUD_UPLINK_H
#define CLOUD_UPLINK_H

#include <stddef.h>

int cloud_uplink_build_body(const char *telemetry_json, char *out, size_t out_size);
int cloud_uplink_build_request(const char *body, char *out, size_t out_size);

#ifndef CLOUD_UPLINK_HOST_TEST
void cloud_uplink_start(void);
#endif

#endif
