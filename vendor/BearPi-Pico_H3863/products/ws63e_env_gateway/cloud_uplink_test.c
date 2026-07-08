#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "cloud_uplink.h"

int main(void)
{
    const char *telemetry = "{\"seq\":42,\"temp_x10\":253,\"humi_x10\":618,\"light_x10\":845,\"motion\":1}";
    const char *expected_body = "{\"deviceId\":\"ws63-car-001\",\"seq\":42,\"temp_x10\":253,"
        "\"humi_x10\":618,\"light_x10\":845,\"motion\":1}";
    char body[512] = {0};
    char request[1024] = {0};
    char expected_length[64] = {0};

    int body_len = cloud_uplink_build_body(telemetry, body, sizeof(body));
    assert(body_len > 0);
    assert(strcmp(body, expected_body) == 0);

    int request_len = cloud_uplink_build_request(body, request, sizeof(request));
    assert(request_len > 0);
    assert(strstr(request, "POST /ws63-api/api/ingest/base-stations/sle-base-001/telemetry HTTP/1.1\r\n") != NULL);
    assert(strstr(request, "Host: www.rxcccccc.icu\r\n") != NULL);
    assert(strstr(request, "Content-Type: application/json\r\n") != NULL);
    assert(strstr(request, "X-Device-Key: ") != NULL);
    assert(strstr(request, "Connection: close\r\n") != NULL);
    snprintf(expected_length, sizeof(expected_length), "Content-Length: %u\r\n", (unsigned int)strlen(expected_body));
    assert(strstr(request, expected_length) != NULL);
    assert(strstr(request, "\r\n\r\n{\"deviceId\":\"ws63-car-001\"") != NULL);

    puts("cloud_uplink_test passed");
    return 0;
}
