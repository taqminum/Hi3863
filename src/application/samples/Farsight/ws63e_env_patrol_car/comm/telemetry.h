#ifndef WS63E_ENV_PATROL_CAR_TELEMETRY_H
#define WS63E_ENV_PATROL_CAR_TELEMETRY_H

#include "../model/env_data.h"

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

int telemetry_init(void);
int telemetry_format_json(const env_data_t *data, char *buf, size_t len);
int telemetry_publish(const env_data_t *data);

#ifdef __cplusplus
}
#endif

#endif
