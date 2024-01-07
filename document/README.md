## Executing a File with Docker and Monitoring Memory & Runtime Usage

* To execute a file within a Docker container and effectively monitor its memory and runtime usage, I utilize the `/usr/bin/time` command. 
* This method provides insights into how much **CPU time** and **memory** the process consumes. 
* The instructions below is how to set up and execute this monitoring:


  ### Docker Command Explanation:
  ```
  echo "1 2" | docker run -i -rm --name python_oj -v [path-name]:[path-name] online_python:latest timeout 1 /usr/bin/time -f '%U %M' python3 /app/sum.py
  ```

  * `timeout 1` : Sets a timeout limit of 1 second to run the command.
  * `/usr/bin/time -f '%U %M` : Invokes the time command to report CPU time (%U) and peak memory usage (%M).
    * `%U` : user time in seconds
    * `%M` : maximum resident set size in KB 

