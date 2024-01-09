## Executing a File with Docker and Monitoring Memory & Runtime Usage

* To execute a file within a Docker container and effectively monitor its memory and runtime usage, I utilize the `/usr/bin/time` command. 
* This method provides insights into how much **CPU time** and **memory** the process consumes. 
* The instructions below is how to set up and execute this monitoring:


  ### Docker Command Explanation:
  ```shell
  echo "1 2" | docker run -i -rm --name python_oj -v [path-name]:[path-name] online_python:latest timeout 1 /usr/bin/time -f '%e %M' python3 /app/sum.py
  ```

  * `timeout 1` : Sets a timeout limit of 1 second to run the command.
  * `/usr/bin/time -f '%e %M` : Invokes the time command to report CPU time (%U) and peak memory usage (%M).
    * `%e` : elapsed real time (wall clock) in seconds
    * `%M` : maximum resident set size in KB 


### Explanation Flow:

1. **Demonstrating `/usr/bin/time` with a Basic Example**  
    To illustrate the usage of `/usr/bin/time``, consider a simple example where we measure the execution time of a basic command like ls, which lists directory contents.

    Example Usage:
    ```shell
    # Running a Docker container
    docker run -it -d --name python_demo -v /Users/amelia/Desktop/AppWork_School_Assignment/pharmcode-worker/document/code:/app online_python:latest

    # Entering the container's shell
    docker exec -it python_demo /bin/bash 

    # Executing 'ls' command and measuring its execution time and memory usage
    /usr/bin/time -f '%e %M' ls
    ```
    Expected Output:  
    This command outputs the execution details of ls. The output is split into two parts:

    * The standard output of the ls command (listing the contents of the directory).
    * The time and memory statistics:
      * Real Time: The total elapsed time (wall-clock time) to run the command.
      * Memory usage: peak memory usage in kilobytes,


2. **Applying `/usr/bin/time` in this Project**

    In this project, I leverage the `/usr/bin/time` command to monitor the performance of Python/JavaScript scripts executed within a Docker container. This approach is particularly useful for understanding the resource usage (such as time and memory) of our scripts in a controlled environment.

    Execution Command:  
    To run a Python script named sum.py (which presumably sums numbers) with input, we use the following command:  
    ```shell
    echo "1 2" | docker run -i --name python_oj -v /Users/amelia/Desktop/AppWork_School_Assignment/pharmcode-worker/document/code:/app online_python:latest timeout 1 /usr/bin/time -f '%e %M' python3 /app/sum.py
    ```
    Expected Output:  
    The output will display the elapsed real time and maximum memory usage of the sum.py script.  
    If the script executes within the set timeout, it'll get the performance metrics. Otherwise, if it exceeds the time limit, it will be terminated without these metrics.



